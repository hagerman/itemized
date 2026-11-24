package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"itemized/internal/auth"
	"itemized/internal/db"
	"itemized/internal/llm"
	"itemized/internal/printer"
	"itemized/internal/upc"
)

const (
	maxJSONBodyBytes = 1 << 20 // 1 MiB
	maxBatchQuantity = 500
)

type Server struct {
	DB           *sql.DB
	Auth         *auth.Service
	OIDC         *auth.OIDCManager
	Printer      *printer.Service
	UPC          *upc.Client
	LLM          *llm.Classifier
	StaticFS     fs.FS
	LoginLimiter *loginRateLimiter
	TrustProxy   bool
}

func NewServer(conn *sql.DB, staticFS fs.FS) *Server {
	return &Server{
		DB:           conn,
		Auth:         auth.NewService(conn),
		OIDC:         auth.NewOIDCManager(),
		Printer:      printer.NewService(),
		UPC:          upc.NewClient(),
		LLM:          llm.NewClassifier(),
		StaticFS:     staticFS,
		LoginLimiter: newLoginRateLimiter(defaultLoginRateLimit, defaultLoginRateWindow),
		TrustProxy:   strings.EqualFold(strings.TrimSpace(os.Getenv("TRUST_PROXY")), "true"),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Healthcheck
	mux.HandleFunc("GET /up", s.handleHealth)

	// Legacy & new QR redirect routes
	mux.HandleFunc("GET /go/i/{id}", s.handleQRItem)
	mux.HandleFunc("GET /go/p/{id}", s.handleQRProduct)
	mux.HandleFunc("GET /go/l/{id}", s.handleQRLocation)

	// Public auth routes
	mux.HandleFunc("GET /api/auth/status", s.handleAuthStatus)
	mux.HandleFunc("POST /api/auth/setup", s.handleAuthSetup)
	mux.HandleFunc("POST /api/auth/login", s.handleAuthLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleAuthLogout)
	mux.HandleFunc("GET /api/auth/oidc/login", s.handleOIDCLogin)
	mux.HandleFunc("GET /api/auth/oidc/callback", s.handleOIDCCallback)

	// Protected API routes
	authed := http.NewServeMux()
	authed.HandleFunc("GET /api/auth/me", s.handleAuthMe)
	authed.HandleFunc("PATCH /api/auth/account", s.handleUpdateAccount)

	// Admin user management
	adminOnly := func(h http.HandlerFunc) http.Handler {
		return auth.RequireAdmin(h)
	}
	authed.Handle("GET /api/users", adminOnly(s.handleListUsers))
	authed.Handle("POST /api/users", adminOnly(s.handleCreateUser))
	authed.Handle("PATCH /api/users/{id}", adminOnly(s.handleUpdateUser))
	authed.Handle("POST /api/users/{id}/reset-password", adminOnly(s.handleResetUserPassword))
	authed.Handle("DELETE /api/users/{id}", adminOnly(s.handleDeleteUser))

	// Settings (Admin-only)
	authed.Handle("GET /api/settings", adminOnly(s.handleGetSettings))
	authed.Handle("PATCH /api/settings", adminOnly(s.handleUpdateSettings))

	// Categories
	authed.HandleFunc("GET /api/categories", s.handleListCategories)
	authed.HandleFunc("POST /api/categories", s.handleCreateCategory)
	authed.HandleFunc("GET /api/categories/{id}", s.handleGetCategory)
	authed.HandleFunc("PATCH /api/categories/{id}", s.handleUpdateCategory)
	authed.HandleFunc("DELETE /api/categories/{id}", s.handleDeleteCategory)

	// Locations
	authed.HandleFunc("GET /api/locations", s.handleListLocations)
	authed.HandleFunc("POST /api/locations", s.handleCreateLocation)
	authed.HandleFunc("GET /api/locations/{id}", s.handleGetLocation)
	authed.HandleFunc("PATCH /api/locations/{id}", s.handleUpdateLocation)
	authed.HandleFunc("DELETE /api/locations/{id}", s.handleDeleteLocation)
	authed.HandleFunc("POST /api/locations/{id}/print-label", s.handlePrintLocationLabel)

	// Products, Variants, Barcodes
	authed.HandleFunc("GET /api/products", s.handleListProducts)
	authed.HandleFunc("POST /api/products", s.handleCreateProduct)
	authed.HandleFunc("GET /api/products/{id}", s.handleGetProduct)
	authed.HandleFunc("PATCH /api/products/{id}", s.handleUpdateProduct)
	authed.HandleFunc("DELETE /api/products/{id}", s.handleDeleteProduct)
	authed.HandleFunc("POST /api/products/{id}/toggle-shopping-list", s.handleToggleShoppingList)
	authed.HandleFunc("POST /api/products/{id}/print-label", s.handlePrintProductLabel)
	authed.HandleFunc("POST /api/products/{id}/variants", s.handleCreateVariant)
	authed.HandleFunc("PATCH /api/variants/{id}", s.handleUpdateVariant)
	authed.HandleFunc("DELETE /api/variants/{id}", s.handleDeleteVariant)
	authed.HandleFunc("POST /api/variants/{id}/barcodes", s.handleCreateBarcode)
	authed.HandleFunc("DELETE /api/barcodes/{id}", s.handleDeleteBarcode)

	// Items
	authed.HandleFunc("POST /api/items", s.handleCreateItems)
	authed.HandleFunc("PATCH /api/items/{id}", s.handleUpdateItem)
	authed.HandleFunc("DELETE /api/items/{id}", s.handleDeleteItem)
	authed.HandleFunc("POST /api/items/{id}/consume", s.handleConsumeItem)
	authed.HandleFunc("POST /api/items/{id}/open", s.handleOpenItem)
	authed.HandleFunc("POST /api/items/{id}/transfer", s.handleTransferItem)
	authed.HandleFunc("POST /api/items/{id}/print-label", s.handlePrintItemLabel)
	authed.HandleFunc("POST /api/items/bulk", s.handleBulkItems)

	// Unified scan & workflows
	authed.HandleFunc("POST /api/scan/resolve", s.handleScanResolve)
	authed.HandleFunc("POST /api/workflows/purchase", s.handlePurchaseWorkflow)
	authed.HandleFunc("POST /api/workflows/inventory/summary", s.handleInventorySummary)
	authed.HandleFunc("POST /api/workflows/inventory/apply", s.handleInventoryApply)

	// UPC & LLM
	authed.HandleFunc("POST /api/upc/lookup", s.handleUPCLookup)
	authed.HandleFunc("POST /api/upc/classify", s.handleUPCClassify)

	// Printers & Label Templates (Admin-only)
	authed.Handle("GET /api/printers", adminOnly(s.handleListPrinters))
	authed.Handle("POST /api/printers", adminOnly(s.handleCreatePrinter))
	authed.Handle("PATCH /api/printers/{id}", adminOnly(s.handleUpdatePrinter))
	authed.Handle("DELETE /api/printers/{id}", adminOnly(s.handleDeletePrinter))
	authed.Handle("POST /api/printers/{id}/test", adminOnly(s.handleTestPrinter))
	authed.Handle("GET /api/label-templates", adminOnly(s.handleListLabelTemplates))
	authed.Handle("PUT /api/label-templates/{entityType}", adminOnly(s.handleUpsertLabelTemplate))
	authed.Handle("DELETE /api/label-templates/{entityType}", adminOnly(s.handleResetLabelTemplate))

	mux.Handle("/api/", auth.RequireAuth(s.Auth, authed))

	// SPA static file fallback
	if s.StaticFS != nil {
		mux.Handle("/", s.spaHandler())
	}

	return mux
}

func (s *Server) spaHandler() http.Handler {
	fileServer := http.FileServer(http.FS(s.StaticFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		clean := strings.TrimPrefix(r.URL.Path, "/")
		if clean != "" {
			if f, err := s.StaticFS.Open(clean); err == nil {
				_ = f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		indexBytes, err := fs.ReadFile(s.StaticFS, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(indexBytes)
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeInternalError(w http.ResponseWriter, contextMsg string, err error) {
	log.Printf("%s: %v", contextMsg, err)
	writeError(w, http.StatusInternalServerError, "internal server error")
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

func parseIDParam(r *http.Request, name string) (int64, error) {
	return strconv.ParseInt(r.PathValue(name), 10, 64)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Settings helpers ---

func (s *Server) getSetting(ctx context.Context, key, envFallback, defaultVal string) string {
	var val string
	err := s.DB.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&val)
	if err == nil && strings.TrimSpace(val) != "" {
		return strings.TrimSpace(val)
	}
	if envFallback != "" {
		if ev := strings.TrimSpace(os.Getenv(envFallback)); ev != "" {
			return ev
		}
	}
	return defaultVal
}

func (s *Server) setSetting(ctx context.Context, key, value string) error {
	now := db.NowUTC()
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, key, value, now)
	return err
}

func (s *Server) baseURL(ctx context.Context, r *http.Request) string {
	if b := s.getSetting(ctx, "base_url", "BASE_URL", ""); b != "" {
		return strings.TrimRight(b, "/")
	}
	if r != nil && r.Host != "" {
		scheme := "http"
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			scheme = "https"
		}
		return scheme + "://" + r.Host
	}
	return "http://localhost:8080"
}

func (s *Server) dueDateAverageCount(ctx context.Context) int {
	raw := s.getSetting(ctx, "due_date_average_count", "", "3")
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 3
	}
	return n
}

func (s *Server) oidcConfig(ctx context.Context, r *http.Request) auth.OIDCConfig {
	autoProv := strings.EqualFold(s.getSetting(ctx, "oidc_auto_provision", "OIDC_AUTO_PROVISION", "false"), "true")
	return auth.OIDCConfig{
		Issuer:        s.getSetting(ctx, "oidc_issuer", "OIDC_ISSUER", ""),
		ClientID:      s.getSetting(ctx, "oidc_client_id", "OIDC_CLIENT_ID", ""),
		ClientSecret:  s.getSetting(ctx, "oidc_client_secret", "OIDC_CLIENT_SECRET", ""),
		RedirectURL:   s.baseURL(ctx, r) + "/api/auth/oidc/callback",
		AutoProvision: autoProv,
	}
}

func (s *Server) llmConfig(ctx context.Context) llm.Config {
	return llm.Config{
		Provider: s.getSetting(ctx, "llm_provider", "LLM_PROVIDER", ""),
		Model:    s.getSetting(ctx, "llm_model", "LLM_MODEL", ""),
		APIKey:   s.getSetting(ctx, "llm_api_key", "LLM_API_KEY", ""),
		BaseURL:  s.getSetting(ctx, "llm_base_url", "LLM_BASE_URL", ""),
	}
}

// --- Auth & User Handlers ---

func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	count, err := s.Auth.UserCount(r.Context())
	if err != nil {
		writeInternalError(w, "auth status user count", err)
		return
	}
	var currentUser *auth.User
	if tok := auth.ExtractToken(r); tok != "" {
		if u, _, err := s.Auth.ValidateToken(r.Context(), tok); err == nil {
			currentUser = u
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"initialized":  count > 0,
		"oidc_enabled": s.oidcConfig(r.Context(), r).Enabled(),
		"user":         currentUser,
	})
}

func (s *Server) handleAuthSetup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user, err := s.Auth.SetupAdmin(r.Context(), req.Email, req.Password)
	if errors.Is(err, auth.ErrAlreadyInitialized) {
		writeError(w, http.StatusForbidden, "setup already completed")
		return
	}
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	raw, _, err := s.Auth.CreateSession(r.Context(), user.ID, auth.SessionKindCookie, r.UserAgent(), clientIP(r, s.TrustProxy), auth.DefaultSessionTTL)
	if err != nil {
		writeInternalError(w, "setup create session", err)
		return
	}
	auth.SetSessionCookie(w, r, raw, auth.DefaultSessionTTL)
	writeJSON(w, http.StatusCreated, map[string]any{"user": user})
}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r, s.TrustProxy)
	if s.LoginLimiter != nil && !s.LoginLimiter.Allow("ip:"+ip) {
		writeError(w, http.StatusTooManyRequests, "too many login attempts, please try again later")
		return
	}
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Mode     string `json:"mode"` // "cookie" (default) or "bearer"
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if normEmail := strings.ToLower(strings.TrimSpace(req.Email)); normEmail != "" {
		if s.LoginLimiter != nil && !s.LoginLimiter.Allow("email:"+normEmail) {
			writeError(w, http.StatusTooManyRequests, "too many login attempts, please try again later")
			return
		}
	}
	user, err := s.Auth.Authenticate(r.Context(), req.Email, req.Password)
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		writeInternalError(w, "login authenticate", err)
		return
	}

	kind := auth.SessionKindCookie
	if strings.EqualFold(req.Mode, auth.SessionKindBearer) {
		kind = auth.SessionKindBearer
	}
	raw, _, err := s.Auth.CreateSession(r.Context(), user.ID, kind, r.UserAgent(), ip, auth.DefaultSessionTTL)
	if err != nil {
		writeInternalError(w, "login create session", err)
		return
	}

	resp := map[string]any{"user": user}
	if kind == auth.SessionKindBearer {
		resp["token"] = raw
	} else {
		auth.SetSessionCookie(w, r, raw, auth.DefaultSessionTTL)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if tok := auth.ExtractToken(r); tok != "" {
		_ = s.Auth.RevokeToken(r.Context(), tok)
	}
	auth.ClearSessionCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleOIDCLogin(w http.ResponseWriter, r *http.Request) {
	cfg := s.oidcConfig(r.Context(), r)
	if !cfg.Enabled() {
		writeError(w, http.StatusNotFound, "oidc not configured")
		return
	}
	kind := auth.SessionKindCookie
	if strings.EqualFold(r.URL.Query().Get("mode"), auth.SessionKindBearer) {
		kind = auth.SessionKindBearer
	}
	authURL, err := s.OIDC.BeginAuth(r.Context(), cfg, kind)
	if err != nil {
		log.Printf("oidc begin auth: %v", err)
		writeError(w, http.StatusBadGateway, "oidc provider unavailable")
		return
	}
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (s *Server) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	cfg := s.oidcConfig(r.Context(), r)
	res, err := s.OIDC.CompleteAuth(r.Context(), cfg, r.URL.Query().Get("state"), r.URL.Query().Get("code"))
	if err != nil {
		log.Printf("oidc complete auth: %v", err)
		writeError(w, http.StatusUnauthorized, "oidc authentication failed")
		return
	}
	user, err := s.Auth.FindOrLinkOIDCUser(r.Context(), res.Issuer, res.Subject, res.Email, cfg.AutoProvision)
	if err != nil {
		writeError(w, http.StatusForbidden, "no matching household account")
		return
	}
	raw, _, err := s.Auth.CreateSession(r.Context(), user.ID, res.SessionKind, r.UserAgent(), clientIP(r, s.TrustProxy), auth.DefaultSessionTTL)
	if err != nil {
		writeInternalError(w, "oidc create session", err)
		return
	}
	if res.SessionKind == auth.SessionKindBearer {
		writeJSON(w, http.StatusOK, map[string]any{"user": user, "token": raw})
		return
	}
	auth.SetSessionCookie(w, r, raw, auth.DefaultSessionTTL)
	http.Redirect(w, r, "/", http.StatusFound)
}

func (s *Server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"user": auth.UserFromContext(r.Context())})
}

func (s *Server) handleUpdateAccount(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email           string `json:"email"`
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u := auth.UserFromContext(r.Context())
	var sessID int64
	if sess := auth.SessionFromContext(r.Context()); sess != nil {
		sessID = sess.ID
	}
	updated, err := s.Auth.UpdateAccount(r.Context(), u.ID, sessID, req.Email, req.CurrentPassword, req.NewPassword)
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, http.StatusUnprocessableEntity, "current password is incorrect")
		return
	}
	if errors.Is(err, auth.ErrDuplicateEmail) {
		writeError(w, http.StatusConflict, "email already in use")
		return
	}
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.Auth.ListUsers(r.Context())
	if err != nil {
		writeInternalError(w, "list users", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u, err := s.Auth.CreateUser(r.Context(), req.Email, req.Password, req.Role)
	if errors.Is(err, auth.ErrDuplicateEmail) {
		writeError(w, http.StatusConflict, "email already in use")
		return
	}
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": u})
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u, err := s.Auth.UpdateUserRole(r.Context(), id, req.Role)
	if errors.Is(err, auth.ErrUserNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *Server) handleResetUserPassword(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	err = s.Auth.ResetPassword(r.Context(), id, req.Password)
	if errors.Is(err, auth.ErrUserNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if current := auth.UserFromContext(r.Context()); current != nil && current.ID == id {
		writeError(w, http.StatusUnprocessableEntity, "cannot delete your own account")
		return
	}
	if err := s.Auth.DeleteUser(r.Context(), id); errors.Is(err, auth.ErrUserNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	} else if err != nil {
		writeInternalError(w, "delete user", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Settings Handlers ---

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	oidcCfg := s.oidcConfig(ctx, r)
	llmCfg := s.llmConfig(ctx)
	writeJSON(w, http.StatusOK, map[string]any{
		"base_url":               s.baseURL(ctx, r),
		"due_date_average_count": s.dueDateAverageCount(ctx),
		"oidc_issuer":            oidcCfg.Issuer,
		"oidc_client_id":         oidcCfg.ClientID,
		"oidc_has_secret":        oidcCfg.ClientSecret != "",
		"oidc_auto_provision":    oidcCfg.AutoProvision,
		"llm_provider":           llmCfg.Provider,
		"llm_model":              llmCfg.Model,
		"llm_base_url":           llmCfg.BaseURL,
		"llm_has_api_key":        llmCfg.APIKey != "",
	})
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req map[string]any
	if !decodeJSON(w, r, &req) {
		return
	}
	allowed := map[string]bool{
		"base_url":               true,
		"due_date_average_count": true,
		"oidc_issuer":            true,
		"oidc_client_id":         true,
		"oidc_client_secret":     true,
		"oidc_auto_provision":    true,
		"llm_provider":           true,
		"llm_model":              true,
		"llm_api_key":            true,
		"llm_base_url":           true,
	}
	for k, v := range req {
		if !allowed[k] || v == nil {
			continue
		}
		if err := s.setSetting(r.Context(), k, fmt.Sprintf("%v", v)); err != nil {
			writeInternalError(w, "update setting", err)
			return
		}
	}
	s.handleGetSettings(w, r)
}

// --- QR Redirect Handlers (/go/i/:id, /go/p/:id, /go/l/:id) ---

func (s *Server) requireBrowserAuth(w http.ResponseWriter, r *http.Request) bool {
	tok := auth.ExtractToken(r)
	if _, _, err := s.Auth.ValidateToken(r.Context(), tok); err != nil {
		http.Redirect(w, r, "/login?next="+r.URL.RequestURI(), http.StatusFound)
		return false
	}
	return true
}

func (s *Server) handleQRItem(w http.ResponseWriter, r *http.Request) {
	if !s.requireBrowserAuth(w, r) {
		return
	}
	raw := strings.TrimSpace(r.PathValue("id"))
	var productID int64
	var consumed sql.NullString
	var err error
	if id, parseErr := strconv.ParseInt(raw, 10, 64); parseErr == nil {
		err = s.DB.QueryRowContext(r.Context(), `SELECT product_id, consumed_on_date FROM items WHERE id = ?`, id).Scan(&productID, &consumed)
	} else {
		err = s.DB.QueryRowContext(r.Context(), `SELECT product_id, consumed_on_date FROM items WHERE legacy_uuid = ?`, strings.ToLower(raw)).Scan(&productID, &consumed)
	}
	if errors.Is(err, sql.ErrNoRows) {
		http.Redirect(w, r, "/?alert=item_not_found", http.StatusFound)
		return
	}
	if err != nil {
		http.Redirect(w, r, "/?alert=error", http.StatusFound)
		return
	}
	target := fmt.Sprintf("/products/%d", productID)
	if consumed.Valid && consumed.String != "" {
		target += "?notice=item_already_consumed"
	}
	http.Redirect(w, r, target, http.StatusFound)
}

func (s *Server) handleQRProduct(w http.ResponseWriter, r *http.Request) {
	if !s.requireBrowserAuth(w, r) {
		return
	}
	raw := strings.TrimSpace(r.PathValue("id"))
	var productID int64
	var err error
	if id, parseErr := strconv.ParseInt(raw, 10, 64); parseErr == nil {
		err = s.DB.QueryRowContext(r.Context(), `SELECT id FROM products WHERE id = ?`, id).Scan(&productID)
	} else {
		err = s.DB.QueryRowContext(r.Context(), `SELECT id FROM products WHERE legacy_uuid = ?`, strings.ToLower(raw)).Scan(&productID)
	}
	if errors.Is(err, sql.ErrNoRows) {
		http.Redirect(w, r, "/?alert=product_not_found", http.StatusFound)
		return
	}
	if err != nil {
		http.Redirect(w, r, "/?alert=error", http.StatusFound)
		return
	}
	http.Redirect(w, r, fmt.Sprintf("/products/%d", productID), http.StatusFound)
}

func (s *Server) handleQRLocation(w http.ResponseWriter, r *http.Request) {
	if !s.requireBrowserAuth(w, r) {
		return
	}
	raw := strings.TrimSpace(r.PathValue("id"))
	var locID int64
	var err error
	if id, parseErr := strconv.ParseInt(raw, 10, 64); parseErr == nil {
		err = s.DB.QueryRowContext(r.Context(), `SELECT id FROM locations WHERE id = ?`, id).Scan(&locID)
	} else {
		err = s.DB.QueryRowContext(r.Context(), `SELECT id FROM locations WHERE legacy_uuid = ?`, strings.ToLower(raw)).Scan(&locID)
	}
	if errors.Is(err, sql.ErrNoRows) {
		http.Redirect(w, r, "/?alert=location_not_found", http.StatusFound)
		return
	}
	if err != nil {
		http.Redirect(w, r, "/?alert=error", http.StatusFound)
		return
	}
	http.Redirect(w, r, fmt.Sprintf("/locations/%d", locID), http.StatusFound)
}

func todayUTC() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}
