package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"itemized/internal/api"
	"itemized/internal/db"
	"itemized/internal/demo"
	"itemized/internal/notify"
)

type stubPushChannel struct {
	sent int
}

func (s *stubPushChannel) Type() string { return notify.ChannelWebPush }
func (s *stubPushChannel) Send(_ context.Context, _ notify.Target, _ notify.Message) error {
	s.sent++
	return nil
}

func TestNotificationsAPIFlow(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "notify-api.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	staticFS := fstest.MapFS{
		"index.html": {Data: []byte("<html></html>")},
		"sw.js":      {Data: []byte("// sw")},
	}
	srv := api.NewServer(conn, staticFS)
	stub := &stubPushChannel{}
	srv.NotifyDispatcher.Register(stub)

	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	// Verify /sw.js has Cache-Control: no-cache
	swResp, err := http.Get(ts.URL + "/sw.js")
	if err != nil {
		t.Fatalf("GET /sw.js: %v", err)
	}
	_ = swResp.Body.Close()
	if swResp.StatusCode != http.StatusOK || swResp.Header.Get("Cache-Control") != "no-cache" {
		t.Fatalf("expected 200 with Cache-Control: no-cache for /sw.js, got %d %q", swResp.StatusCode, swResp.Header.Get("Cache-Control"))
	}

	// Setup admin user (User A)
	setupResp, err := http.Post(ts.URL+"/api/auth/setup", "application/json", strings.NewReader(`{"email":"admin@example.com","password":"password123"}`))
	if err != nil || setupResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup failed: err=%v resp=%v", err, setupResp)
	}
	adminCookies := setupResp.Cookies()
	_ = setupResp.Body.Close()

	doReq := func(method, path, body string, cookies []*http.Cookie) *http.Response {
		t.Helper()
		req, err := http.NewRequest(method, ts.URL+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new req: %v", err)
		}
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		for _, c := range cookies {
			req.AddCookie(c)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("do req %s %s: %v", method, path, err)
		}
		return resp
	}

	// Create second user (User B) and login
	resp := doReq("POST", "/api/users", `{"email":"member@example.com","password":"password123","role":"member"}`, adminCookies)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create member status = %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	loginResp, err := http.Post(ts.URL+"/api/auth/login", "application/json", strings.NewReader(`{"email":"member@example.com","password":"password123"}`))
	if err != nil || loginResp.StatusCode != http.StatusOK {
		t.Fatalf("member login failed: %v", err)
	}
	memberCookies := loginResp.Cookies()
	_ = loginResp.Body.Close()

	// 1. Config exposes VAPID public key idempotently
	cfgResp1 := doReq("GET", "/api/notifications/config", "", adminCookies)
	var cfg1 struct {
		Enabled        bool   `json:"enabled"`
		VAPIDPublicKey string `json:"vapid_public_key"`
		Timezone       string `json:"timezone"`
	}
	_ = json.NewDecoder(cfgResp1.Body).Decode(&cfg1)
	_ = cfgResp1.Body.Close()
	if !cfg1.Enabled || cfg1.VAPIDPublicKey == "" || cfg1.Timezone == "" {
		t.Fatalf("unexpected config: %+v", cfg1)
	}

	cfgResp2 := doReq("GET", "/api/notifications/config", "", memberCookies)
	var cfg2 struct {
		VAPIDPublicKey string `json:"vapid_public_key"`
	}
	_ = json.NewDecoder(cfgResp2.Body).Decode(&cfg2)
	_ = cfgResp2.Body.Close()
	if cfg1.VAPIDPublicKey != cfg2.VAPIDPublicKey {
		t.Fatalf("VAPID public key changed between requests")
	}

	// 2. Preferences validation & update
	badPref := doReq("PATCH", "/api/notifications/preferences", `{"digest_time":"25:99"}`, adminCookies)
	_ = badPref.Body.Close()
	if badPref.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for bad digest_time, got %d", badPref.StatusCode)
	}

	okPref := doReq("PATCH", "/api/notifications/preferences", `{"digest_time":"09:15","expiration_enabled":true,"shopping_list_enabled":true}`, adminCookies)
	var prefOut struct {
		DigestTime          string `json:"digest_time"`
		ExpirationEnabled   bool   `json:"expiration_enabled"`
		ShoppingListEnabled bool   `json:"shopping_list_enabled"`
	}
	_ = json.NewDecoder(okPref.Body).Decode(&prefOut)
	_ = okPref.Body.Close()
	if okPref.StatusCode != http.StatusOK || prefOut.DigestTime != "09:15" || !prefOut.ExpirationEnabled || !prefOut.ShoppingListEnabled {
		t.Fatalf("unexpected updated prefs: status=%d body=%+v", okPref.StatusCode, prefOut)
	}

	// 3. Test notification with no targets -> 422
	noTargetTest := doReq("POST", "/api/notifications/test", "", adminCookies)
	_ = noTargetTest.Body.Close()
	if noTargetTest.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 with no enrolled targets, got %d", noTargetTest.StatusCode)
	}

	// 4. Enroll target & send test
	createTarget := doReq("POST", "/api/notifications/targets", `{
		"channel":"web_push",
		"label":"iPhone",
		"endpoint":"https://web.push.apple.com/sub/123",
		"p256dh":"pubKeyValue",
		"auth":"authSecretValue"
	}`, adminCookies)
	var targetOut notify.TargetSummary
	_ = json.NewDecoder(createTarget.Body).Decode(&targetOut)
	_ = createTarget.Body.Close()
	if createTarget.StatusCode != http.StatusCreated || targetOut.ID == 0 || targetOut.Label != "iPhone" {
		t.Fatalf("unexpected create target: status=%d body=%+v", createTarget.StatusCode, targetOut)
	}

	// Member cannot delete admin's target -> 404
	forbiddenDel := doReq("DELETE", "/api/notifications/targets/1", "", memberCookies)
	_ = forbiddenDel.Body.Close()
	if forbiddenDel.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 deleting another user's target, got %d", forbiddenDel.StatusCode)
	}

	// Test notification succeeds
	testResp := doReq("POST", "/api/notifications/test", "", adminCookies)
	var testOut notify.DeliveryResult
	_ = json.NewDecoder(testResp.Body).Decode(&testOut)
	_ = testResp.Body.Close()
	if testResp.StatusCode != http.StatusOK || testOut.Sent != 1 || stub.sent != 1 {
		t.Fatalf("unexpected test notification result: status=%d out=%+v stub=%d", testResp.StatusCode, testOut, stub.sent)
	}
}

func TestNotificationsBlockedInDemoMode(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "notify-demo.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	mgr, err := demo.NewManager(conn, time.Hour)
	if err != nil {
		t.Fatalf("new demo manager: %v", err)
	}
	srv := api.NewServer(conn, nil)
	srv.EnableDemoMode(mgr)

	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	for _, tc := range []struct {
		method string
		path   string
		body   string
	}{
		{"POST", "/api/notifications/targets", `{"endpoint":"https://example.com","p256dh":"a","auth":"b"}`},
		{"DELETE", "/api/notifications/targets/1", ""},
		{"POST", "/api/notifications/test", ""},
		{"PATCH", "/api/notifications/preferences", `{"expiration_enabled":true}`},
	} {
		req, _ := http.NewRequest(tc.method, ts.URL+tc.path, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", tc.method, tc.path, err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("demo mode %s %s: expected 403, got %d", tc.method, tc.path, resp.StatusCode)
		}
	}
}
