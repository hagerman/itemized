package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"itemized/internal/db"
	"itemized/internal/demo"
	"itemized/internal/printer"
	"itemized/internal/upc"
)

func TestDemoModeAuthBypassSandboxingAndReset(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	var clockMu sync.Mutex
	cur := time.Date(2026, 11, 25, 17, 15, 0, 0, time.UTC)
	nowFn := func() time.Time {
		clockMu.Lock()
		defer clockMu.Unlock()
		return cur
	}

	mgr, err := demo.NewManagerWithClock(conn, time.Hour, nowFn)
	if err != nil {
		t.Fatalf("new demo manager: %v", err)
	}

	srv := NewServer(conn, nil)
	srv.EnableDemoMode(mgr)
	drv := &fakeDriver{}
	srv.Printer.RegisterDriver(printer.DriverIPPZPL, drv)

	// Stub UPC external HTTP calls to a fast local test server so tests are offline & deterministic.
	upcStub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":0}`))
	}))
	defer upcStub.Close()
	srv.UPC = &upc.Client{
		BaseURL:    upcStub.URL,
		HTTPClient: upcStub.Client(),
	}

	h := srv.Handler()

	// 1. /api/auth/status reports demo mode, reset time, and demo admin user with no cookie.
	rec := doReq(t, h, http.MethodGet, "/api/auth/status", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/auth/status expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var statusResp struct {
		Initialized bool   `json:"initialized"`
		DemoMode    bool   `json:"demo_mode"`
		DemoResetAt string `json:"demo_reset_at"`
		OIDCEnabled bool   `json:"oidc_enabled"`
		OIDCForce   bool   `json:"oidc_force"`
		LLMEnabled  bool   `json:"llm_enabled"`
		User        *struct {
			ID    int64  `json:"id"`
			Email string `json:"email"`
			Role  string `json:"role"`
		} `json:"user"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&statusResp); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if !statusResp.DemoMode || !statusResp.Initialized || statusResp.OIDCEnabled || statusResp.OIDCForce || statusResp.LLMEnabled {
		t.Fatalf("unexpected demo status flags: %+v", statusResp)
	}
	if statusResp.DemoResetAt != "2026-11-25T18:00:00Z" {
		t.Fatalf("demo_reset_at = %q, want 2026-11-25T18:00:00Z", statusResp.DemoResetAt)
	}
	if statusResp.User == nil || statusResp.User.Email != demo.DemoAdminEmail || statusResp.User.Role != "admin" {
		t.Fatalf("unexpected demo user: %+v", statusResp.User)
	}
	demoAdminID := statusResp.User.ID

	// 2. Unauthenticated protected API calls succeed as demo admin.
	rec = doReq(t, h, http.MethodGet, "/api/products?status=all", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/products expected 200, got %d", rec.Code)
	}
	var prodResp struct {
		Products []Product `json:"products"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&prodResp); err != nil || len(prodResp.Products) < 5 {
		t.Fatalf("expected seeded products, got %d (err=%v)", len(prodResp.Products), err)
	}
	firstProductID := prodResp.Products[0].ID

	// 3. Unauthenticated QR redirect goes straight to product page, not /login.
	rec = doReq(t, h, http.MethodGet, fmt.Sprintf("/go/p/%d", firstProductID), nil, "")
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != fmt.Sprintf("/products/%d", firstProductID) {
		t.Fatalf("GET /go/p/%d expected 302 to /products/%d, got %d -> %q", firstProductID, firstProductID, rec.Code, rec.Header().Get("Location"))
	}

	// 4. Auth mutation endpoints are rejected with 403.
	for _, tc := range []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodPost, "/api/auth/setup", map[string]string{"email": "x@y.com", "password": "password123"}},
		{http.MethodPost, "/api/auth/login", map[string]string{"email": "x@y.com", "password": "password123"}},
		{http.MethodPost, "/api/auth/logout", nil},
		{http.MethodGet, "/api/auth/oidc/login", nil},
		{http.MethodGet, "/api/auth/oidc/callback?code=abc&state=xyz", nil},
		{http.MethodPatch, "/api/auth/account", map[string]string{"email": "other@example.com"}},
	} {
		rec = doReq(t, h, tc.method, tc.path, tc.body, "")
		if rec.Code != http.StatusForbidden {
			t.Fatalf("%s %s expected 403 in demo mode, got %d: %s", tc.method, tc.path, rec.Code, rec.Body.String())
		}
	}

	// 5. Demo admin account is protected from role change, password reset, and deletion.
	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/users/%d", demoAdminID), map[string]string{"role": "member"}, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("PATCH demo admin expected 403, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/users/%d/reset-password", demoAdminID), map[string]string{"password": "newpassword123"}, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("reset-password demo admin expected 403, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodDelete, fmt.Sprintf("/api/users/%d", demoAdminID), nil, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("DELETE demo admin expected 403, got %d", rec.Code)
	}

	// 6. Printer sandboxing: test print returns 403 and print-label returns warning, zero driver calls.
	rec = doReq(t, h, http.MethodGet, "/api/printers", nil, "")
	var printersResp struct {
		Printers []PrinterRecord `json:"printers"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&printersResp)
	if len(printersResp.Printers) == 0 {
		t.Fatalf("expected seeded sample printer")
	}
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/printers/%d/test", printersResp.Printers[0].ID), nil, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("POST /api/printers/{id}/test expected 403 in demo mode, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/print-label", firstProductID), nil, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "disabled in demo mode") {
		t.Fatalf("print-label expected 200 with demo notice, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(drv.jobs) != 0 {
		t.Fatalf("expected 0 printer driver jobs in demo mode, got %d", len(drv.jobs))
	}

	// Label templates remain editable in demo mode.
	rec = doReq(t, h, http.MethodPut, "/api/label-templates/item", map[string]string{"content": "^XA^FO20,20^FD{{.Payload.ProductName}}^FS^XZ"}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT /api/label-templates/item expected 200 in demo mode, got %d: %s", rec.Code, rec.Body.String())
	}

	// 7. OIDC and LLM settings are locked/ignored in demo mode.
	rec = doReq(t, h, http.MethodPatch, "/api/settings", map[string]any{
		"due_date_average_count": 5,
		"oidc_issuer":            "http://169.254.169.254/latest",
		"oidc_client_id":         "evil",
		"oidc_force":             "true",
		"llm_provider":           "openai-compatible",
		"llm_model":              "llama3",
		"llm_base_url":           "http://169.254.169.254/v1",
		"llm_api_key":            "secret",
	}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("PATCH /api/settings expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var settingsResp map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&settingsResp)
	if settingsResp["oidc_issuer"] != "" || settingsResp["llm_provider"] != "" || settingsResp["llm_base_url"] != "" {
		t.Fatalf("expected OIDC/LLM settings to remain empty in demo mode, got %+v", settingsResp)
	}
	rec = doReq(t, h, http.MethodPost, "/api/upc/classify", map[string]string{"title": "Milk"}, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"enabled":false`) {
		t.Fatalf("POST /api/upc/classify expected enabled:false in demo mode, got %d: %s", rec.Code, rec.Body.String())
	}

	// 8. UPC lookup rate limited to 5 per minute in demo mode.
	for i := 1; i <= 5; i++ {
		rec = doReq(t, h, http.MethodPost, "/api/upc/lookup", map[string]string{"barcode": "004190007561"}, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("UPC lookup #%d expected 200, got %d: %s", i, rec.Code, rec.Body.String())
		}
	}
	rec = doReq(t, h, http.MethodPost, "/api/upc/lookup", map[string]string{"barcode": "004190007561"}, "")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("6th UPC lookup expected 429, got %d: %s", rec.Code, rec.Body.String())
	}

	// 9. Lazy reset middleware wipes mutations after interval boundary.
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]string{"name": "Ephemeral Demo Category"}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("create category expected 201, got %d", rec.Code)
	}

	clockMu.Lock()
	cur = time.Date(2026, 11, 25, 18, 0, 1, 0, time.UTC)
	clockMu.Unlock()

	rec = doReq(t, h, http.MethodGet, "/api/categories", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/categories after reset expected 200, got %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "Ephemeral Demo Category") {
		t.Fatalf("expected Ephemeral Demo Category to be wiped on lazy reset")
	}

	rec = doReq(t, h, http.MethodGet, "/api/auth/status", nil, "")
	if !strings.Contains(rec.Body.String(), `"demo_reset_at":"2026-11-25T19:00:00Z"`) {
		t.Fatalf("expected demo_reset_at advanced to 19:00:00Z, got %s", rec.Body.String())
	}
}
