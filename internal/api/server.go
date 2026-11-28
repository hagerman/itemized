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
	"itemized/internal/demo"
	"itemized/internal/llm"
	"itemized/internal/printer"
	"itemized/internal/upc"
)

const (
	maxJSONBodyBytes    = 1 << 20 // 1 MiB
	maxBatchQuantity    = 500
	demoUPCRateLimit    = 5
	demoUPCRateWindow   = time.Minute
)

type Server struct {
	DB             *sql.DB
	Auth           *auth.Service
	OIDC           *auth.OIDCManager
	Printer        *printer.Service
	UPC            *upc.Client
	LLM            *llm.Classifier
	StaticFS       fs.FS
	LoginLimiter   *loginRateLimiter
	DemoUPCLimiter *loginRateLimiter
	DemoMode       bool
	DemoManager    *demo.Manager
	TrustProxy     bool
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

// EnableDemoMode configures the server to run in public demo mode with the given reset manager.
func (s *Server) EnableDemoMode(mgr *demo.Manager) {
	s.DemoMode = true
	s.DemoManager = mgr
	s.DemoUPCLimiter = newLoginRateLimiter(demoUPCRateLimit, demoUPCRateWindow)
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Healthcheck
	mux.HandleFunc("GET /up", s.handleHealth)

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

	// Onboarding
	authed.HandleFunc("POST /api/onboarding/starter-taxonomy", s.handleStarterTaxonomy)

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
	authed.HandleFunc("POST /api/products/merge", s.handleMergeProducts)
	authed.HandleFunc("POST /api/products/reclassify/suggest", s.handleReclassifySuggest)
	authed.HandleFunc("POST /api/products/reclassify/apply", s.handleReclassifyApply)
	authed.HandleFunc("GET /api/products/{id}", s.handleGetProduct)
	authed.HandleFunc("PATCH /api/products/{id}", s.handleUpdateProduct)
	authed.HandleFunc("DELETE /api/products/{id}", s.handleDeleteProduct)
	authed.HandleFunc("POST /api/products/{id}/toggle-shopping-list", s.handleToggleShoppingList)
	authed.HandleFunc("POST /api/products/{id}/consume-next", s.handleConsumeNextProductItem)
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

	mux.Handle("/api/", s.requireAuthMiddleware(authed))

	// SPA static file fallback
	if s.StaticFS != nil {
		mux.Handle("/", s.spaHandler())
	}

	if s.DemoMode && s.DemoManager != nil {
		return s.demoResetMiddleware(mux)
	}

	return mux
}

func (s *Server) demoResetMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/up" {
			if err := s.DemoManager.EnsureFresh(r.Context()); err != nil {
				writeInternalError(w, "demo reset", err)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) demoUser(ctx context.Context) (*auth.User, error) {
	return s.Auth.GetUserByEmail(ctx, demo.DemoAdminEmail)
}

func (s *Server) requireAuthMiddleware(next http.Handler) http.Handler {
	standard := auth.RequireAuth(s.Auth, next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.DemoMode {
			u, err := s.demoUser(r.Context())
			if err != nil {
				writeInternalError(w, "demo auth user lookup", err)
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithAuth(r.Context(), u, nil)))
			return
		}
		standard.ServeHTTP(w, r)
	})
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
	if s.DemoMode {
		return auth.OIDCConfig{}
	}
	autoProv := strings.EqualFold(s.getSetting(ctx, "oidc_auto_provision", "OIDC_AUTO_PROVISION", "false"), "true")
	force := strings.EqualFold(s.getSetting(ctx, "oidc_force", "OIDC_FORCE", "false"), "true")
	return auth.OIDCConfig{
		Issuer:        s.getSetting(ctx, "oidc_issuer", "OIDC_ISSUER", ""),
		ClientID:      s.getSetting(ctx, "oidc_client_id", "OIDC_CLIENT_ID", ""),
		ClientSecret:  s.getSetting(ctx, "oidc_client_secret", "OIDC_CLIENT_SECRET", ""),
		RedirectURL:   s.baseURL(ctx, r) + "/api/auth/oidc/callback",
		AutoProvision: autoProv,
		Force:         force,
	}
}

func (s *Server) llmConfig(ctx context.Context) llm.Config {
	if s.DemoMode {
		return llm.Config{}
	}
	return llm.Config{
		Provider: s.getSetting(ctx, "llm_provider", "LLM_PROVIDER", ""),
		Model:    s.getSetting(ctx, "llm_model", "LLM_MODEL", ""),
		APIKey:   s.getSetting(ctx, "llm_api_key", "LLM_API_KEY", ""),
		BaseURL:  s.getSetting(ctx, "llm_base_url", "LLM_BASE_URL", ""),
	}
}

func (s *Server) hasPrinters(ctx context.Context) (bool, error) {
	q := `SELECT COUNT(1) FROM printers WHERE enabled = 1`
	if s.DemoMode {
		q = `SELECT COUNT(1) FROM printers`
	}
	var n int
	if err := s.DB.QueryRowContext(ctx, q).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

// --- Auth & User Handlers ---

func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	printersEnabled, err := s.hasPrinters(r.Context())
	if err != nil {
		writeInternalError(w, "auth status printers", err)
		return
	}
	if s.DemoMode {
		u, err := s.demoUser(r.Context())
		if err != nil {
			writeInternalError(w, "demo auth status user", err)
			return
		}
		resp := map[string]any{
			"initialized":      true,
			"oidc_enabled":     false,
			"oidc_force":       false,
			"llm_enabled":      false,
			"printers_enabled": printersEnabled,
			"demo_mode":        true,
			"user":             u,
		}
		if s.DemoManager != nil {
			resp["demo_reset_at"] = s.DemoManager.NextResetAt().UTC().Format(time.RFC3339)
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

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
	oidcCfg := s.oidcConfig(r.Context(), r)
	writeJSON(w, http.StatusOK, map[string]any{
		"initialized":      count > 0,
		"oidc_enabled":     oidcCfg.Enabled(),
		"oidc_force":       oidcCfg.ForceActive(),
		"llm_enabled":      s.llmConfig(r.Context()).Enabled(),
		"printers_enabled": printersEnabled,
		"demo_mode":        false,
		"user":             currentUser,
	})
}

func (s *Server) handleAuthSetup(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "disabled in demo mode")
		return
	}
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
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "disabled in demo mode")
		return
	}
	if s.oidcConfig(r.Context(), r).ForceActive() {
		writeError(w, http.StatusForbidden, "local password login is disabled; sign in with OIDC")
		return
	}
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
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "disabled in demo mode")
		return
	}
	if tok := auth.ExtractToken(r); tok != "" {
		_ = s.Auth.RevokeToken(r.Context(), tok)
	}
	auth.ClearSessionCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleOIDCLogin(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "disabled in demo mode")
		return
	}
	cfg := s.oidcConfig(r.Context(), r)
	if !cfg.Enabled() {
		writeError(w, http.StatusNotFound, "oidc not configured")
		return
	}
	kind := auth.SessionKindCookie
	if strings.EqualFold(r.URL.Query().Get("mode"), auth.SessionKindBearer) {
		kind = auth.SessionKindBearer
	}
	nextPath := auth.SanitizeNextPath(r.URL.Query().Get("next"))
	authURL, err := s.OIDC.BeginAuth(r.Context(), cfg, kind, nextPath)
	if err != nil {
		log.Printf("oidc begin auth: %v", err)
		writeError(w, http.StatusBadGateway, "oidc provider unavailable")
		return
	}
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (s *Server) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "disabled in demo mode")
		return
	}
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
	http.Redirect(w, r, auth.SanitizeNextPath(res.Next), http.StatusFound)
}

func (s *Server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"user": auth.UserFromContext(r.Context())})
}

func (s *Server) handleUpdateAccount(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "disabled in demo mode")
		return
	}
	var req struct {
		Email               string `json:"email"`
		CurrentPassword     string `json:"current_password"`
		NewPassword         string `json:"new_password"`
		Theme               string `json:"theme"`
		QuickActionsEnabled *bool  `json:"quick_actions_enabled"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u := auth.UserFromContext(r.Context())
	var sessID int64
	if sess := auth.SessionFromContext(r.Context()); sess != nil {
		sessID = sess.ID
	}
	updated, err := s.Auth.UpdateAccount(r.Context(), u.ID, sessID, req.Email, req.CurrentPassword, req.NewPassword, req.Theme, req.QuickActionsEnabled)
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, http.StatusUnprocessableEntity, "current password is incorrect")
		return
	}
	if errors.Is(err, auth.ErrInvalidTheme) {
		writeError(w, http.StatusUnprocessableEntity, "theme must be one of system, light, or dark")
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

func (s *Server) isProtectedDemoAdmin(ctx context.Context, userID int64) bool {
	if !s.DemoMode {
		return false
	}
	u, err := s.Auth.GetUser(ctx, userID)
	return err == nil && strings.EqualFold(u.Email, demo.DemoAdminEmail)
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if s.isProtectedDemoAdmin(r.Context(), id) {
		writeError(w, http.StatusForbidden, "cannot modify the demo administrator account in demo mode")
		return
	}
	if current := auth.UserFromContext(r.Context()); current != nil && current.ID == id {
		writeError(w, http.StatusUnprocessableEntity, "cannot change your own role")
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
	if errors.Is(err, auth.ErrLastAdmin) {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
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
	if s.isProtectedDemoAdmin(r.Context(), id) {
		writeError(w, http.StatusForbidden, "cannot modify the demo administrator account in demo mode")
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
	if s.isProtectedDemoAdmin(r.Context(), id) {
		writeError(w, http.StatusForbidden, "cannot modify the demo administrator account in demo mode")
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
		"oidc_force":             oidcCfg.ForceActive(),
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
		"oidc_issuer":            !s.DemoMode,
		"oidc_client_id":         !s.DemoMode,
		"oidc_client_secret":     !s.DemoMode,
		"oidc_auto_provision":    !s.DemoMode,
		"oidc_force":             !s.DemoMode,
		"llm_provider":           !s.DemoMode,
		"llm_model":              !s.DemoMode,
		"llm_api_key":            !s.DemoMode,
		"llm_base_url":           !s.DemoMode,
	}

	if !s.DemoMode {
		oidcCfg := s.oidcConfig(r.Context(), r)
		nextIssuer := oidcCfg.Issuer
		nextClientID := oidcCfg.ClientID
		nextForce := oidcCfg.Force
		explicitForce := false

		if v, ok := req["oidc_issuer"]; ok && v != nil {
			nextIssuer = strings.TrimSpace(fmt.Sprintf("%v", v))
		}
		if v, ok := req["oidc_client_id"]; ok && v != nil {
			nextClientID = strings.TrimSpace(fmt.Sprintf("%v", v))
		}
		if v, ok := req["oidc_force"]; ok && v != nil {
			nextForce = strings.EqualFold(strings.TrimSpace(fmt.Sprintf("%v", v)), "true")
			explicitForce = true
		}

		nextEnabled := nextIssuer != "" && nextClientID != ""
		if nextForce && !nextEnabled {
			if explicitForce {
				writeError(w, http.StatusUnprocessableEntity, "configure OIDC issuer and client ID before forcing OIDC")
				return
			}
			req["oidc_force"] = "false"
		} else if explicitForce {
			if nextForce {
				req["oidc_force"] = "true"
			} else {
				req["oidc_force"] = "false"
			}
		}
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

func todayUTC() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}
