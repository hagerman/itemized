package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"itemized/internal/db"
)

func TestSetupAuthSessionsAndMiddleware(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	svc := NewService(conn)
	ctx := context.Background()

	// 1. First-run admin setup succeeds once, then locks out.
	admin, err := svc.SetupAdmin(ctx, "Admin@Example.com", "supersecret123")
	if err != nil {
		t.Fatalf("SetupAdmin failed: %v", err)
	}
	if admin.Role != RoleAdmin || admin.Email != "admin@example.com" {
		t.Fatalf("unexpected admin user: %+v", admin)
	}
	if _, err := svc.SetupAdmin(ctx, "other@example.com", "supersecret123"); err != ErrAlreadyInitialized {
		t.Fatalf("expected ErrAlreadyInitialized, got %v", err)
	}

	// 2. Authenticate valid vs invalid credentials.
	if _, err := svc.Authenticate(ctx, "admin@example.com", "wrongpassword"); err != ErrInvalidCredentials {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
	gotUser, err := svc.Authenticate(ctx, "ADMIN@example.com", "supersecret123")
	if err != nil || gotUser.ID != admin.ID {
		t.Fatalf("Authenticate failed: user=%+v err=%v", gotUser, err)
	}

	// 3. Create cookie and bearer sessions and verify RequireAuth middleware.
	cookieTok, _, err := svc.CreateSession(ctx, admin.ID, SessionKindCookie, "browser", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("CreateSession cookie: %v", err)
	}
	bearerTok, _, err := svc.CreateSession(ctx, admin.ID, SessionKindBearer, "ios", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("CreateSession bearer: %v", err)
	}

	protected := RequireAuth(svc, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := UserFromContext(r.Context())
		if u == nil || u.ID != admin.ID {
			t.Fatalf("expected user in context")
		}
		w.WriteHeader(http.StatusOK)
	}))

	// Unauthenticated -> 401
	rec := httptest.NewRecorder()
	protected.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/test", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	// Cookie auth -> 200
	reqCookie := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	reqCookie.AddCookie(&http.Cookie{Name: SessionCookieName, Value: cookieTok})
	rec = httptest.NewRecorder()
	protected.ServeHTTP(rec, reqCookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for cookie auth, got %d", rec.Code)
	}

	// Bearer auth -> 200
	reqBearer := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	reqBearer.Header.Set("Authorization", "Bearer "+bearerTok)
	rec = httptest.NewRecorder()
	protected.ServeHTTP(rec, reqBearer)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for bearer auth, got %d", rec.Code)
	}

	// Logout revokes token -> 401
	if err := svc.RevokeToken(ctx, bearerTok); err != nil {
		t.Fatalf("RevokeToken: %v", err)
	}
	rec = httptest.NewRecorder()
	protected.ServeHTTP(rec, reqBearer)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 after logout, got %d", rec.Code)
	}
}

func TestOIDCUserLinkingAndAutoProvision(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	svc := NewService(conn)
	ctx := context.Background()

	// Create existing local user.
	u, err := svc.SetupAdmin(ctx, "alice@example.com", "password123")
	if err != nil {
		t.Fatalf("SetupAdmin: %v", err)
	}

	// Link by email on first OIDC login.
	linked, err := svc.FindOrLinkOIDCUser(ctx, "https://idp.local", "sub-123", "alice@example.com", false)
	if err != nil {
		t.Fatalf("FindOrLinkOIDCUser link: %v", err)
	}
	if linked.ID != u.ID || linked.OIDCSubject == nil || *linked.OIDCSubject != "sub-123" {
		t.Fatalf("expected linked user, got %+v", linked)
	}

	// Subsequent login matches (issuer, subject) even without email.
	again, err := svc.FindOrLinkOIDCUser(ctx, "https://idp.local", "sub-123", "", false)
	if err != nil || again.ID != u.ID {
		t.Fatalf("expected match by issuer+sub, got %+v err=%v", again, err)
	}

	// Unknown user with autoProvision=false -> ErrUnauthorized.
	if _, err := svc.FindOrLinkOIDCUser(ctx, "https://idp.local", "sub-999", "bob@example.com", false); err != ErrUnauthorized {
		t.Fatalf("expected ErrUnauthorized, got %v", err)
	}

	// Unknown user with autoProvision=true -> creates member.
	bob, err := svc.FindOrLinkOIDCUser(ctx, "https://idp.local", "sub-999", "bob@example.com", true)
	if err != nil || bob.Role != RoleMember {
		t.Fatalf("expected auto-provisioned member, got %+v err=%v", bob, err)
	}

	// OIDC disabled check.
	if (OIDCConfig{}).Enabled() {
		t.Fatalf("expected empty OIDCConfig to be disabled")
	}
}

func TestSessionRevocationOnPasswordResetAndChange(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	svc := NewService(conn)
	ctx := context.Background()

	u, err := svc.SetupAdmin(ctx, "admin@example.com", "password123")
	if err != nil {
		t.Fatalf("SetupAdmin: %v", err)
	}

	// Create two sessions for the user.
	tok1, sess1, err := svc.CreateSession(ctx, u.ID, SessionKindCookie, "browser-1", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("CreateSession 1: %v", err)
	}
	tok2, _, err := svc.CreateSession(ctx, u.ID, SessionKindBearer, "mobile-2", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("CreateSession 2: %v", err)
	}

	// Changing own password keeps current session (sess1) and revokes other sessions (tok2).
	if _, err := svc.UpdateAccount(ctx, u.ID, sess1.ID, "", "password123", "newpassword456", "", nil); err != nil {
		t.Fatalf("UpdateAccount password change: %v", err)
	}
	if _, _, err := svc.ValidateToken(ctx, tok1); err != nil {
		t.Fatalf("expected current session tok1 to remain valid, got %v", err)
	}
	if _, _, err := svc.ValidateToken(ctx, tok2); err != ErrUnauthorized {
		t.Fatalf("expected other session tok2 to be revoked, got %v", err)
	}

	// Admin password reset revokes ALL sessions including tok1.
	tok3, _, err := svc.CreateSession(ctx, u.ID, SessionKindBearer, "tablet-3", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("CreateSession 3: %v", err)
	}
	if err := svc.ResetPassword(ctx, u.ID, "resetpassword789"); err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}
	if _, _, err := svc.ValidateToken(ctx, tok1); err != ErrUnauthorized {
		t.Fatalf("expected tok1 revoked after ResetPassword, got %v", err)
	}
	if _, _, err := svc.ValidateToken(ctx, tok3); err != ErrUnauthorized {
		t.Fatalf("expected tok3 revoked after ResetPassword, got %v", err)
	}
}

func TestUpdateUserRoleSafeguards(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	svc := NewService(conn)
	ctx := context.Background()

	admin1, err := svc.SetupAdmin(ctx, "admin1@example.com", "password123")
	if err != nil {
		t.Fatalf("SetupAdmin: %v", err)
	}
	member, err := svc.CreateUser(ctx, "member@example.com", "password123", RoleMember)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	// Cannot demote the only remaining admin.
	if _, err := svc.UpdateUserRole(ctx, admin1.ID, RoleMember); err != ErrLastAdmin {
		t.Fatalf("expected ErrLastAdmin, got %v", err)
	}

	// Promote member to admin.
	promoted, err := svc.UpdateUserRole(ctx, member.ID, RoleAdmin)
	if err != nil || promoted.Role != RoleAdmin {
		t.Fatalf("expected promoted admin, got user=%+v err=%v", promoted, err)
	}

	// With two admins, demoting one to member succeeds.
	demoted, err := svc.UpdateUserRole(ctx, promoted.ID, RoleMember)
	if err != nil || demoted.Role != RoleMember {
		t.Fatalf("expected demoted member, got user=%+v err=%v", demoted, err)
	}

	// Invalid role and unknown user errors.
	if _, err := svc.UpdateUserRole(ctx, member.ID, "owner"); err != ErrInvalidRole {
		t.Fatalf("expected ErrInvalidRole, got %v", err)
	}
	if _, err := svc.UpdateUserRole(ctx, 9999, RoleAdmin); err != ErrUserNotFound {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}
}

func TestSanitizeNextPath(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", "/"},
		{"   ", "/"},
		{"/", "/"},
		{"/go/i/42", "/go/i/42"},
		{"/go/p/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "/go/p/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"},
		{"/go/l/3?foo=bar", "/go/l/3?foo=bar"},
		{"https://evil.example/phish", "/"},
		{"http://evil.example/go/i/1", "/"},
		{"//evil.example/go/i/1", "/"},
		{"/\\evil.example", "/"},
		{"/go/i/1\\foo", "/"},
		{"/go/i/1\r\nSet-Cookie: a=b", "/"},
		{"javascript:alert(1)", "/"},
	}
	for _, tc := range cases {
		if got := SanitizeNextPath(tc.in); got != tc.want {
			t.Errorf("SanitizeNextPath(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestUserThemePreference(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	svc := NewService(conn)
	ctx := context.Background()

	u, err := svc.SetupAdmin(ctx, "admin@example.com", "password123")
	if err != nil {
		t.Fatalf("SetupAdmin: %v", err)
	}
	if u.Theme != ThemeSystem {
		t.Fatalf("expected default theme %q, got %q", ThemeSystem, u.Theme)
	}

	m, err := svc.CreateUser(ctx, "member@example.com", "password123", RoleMember)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if m.Theme != ThemeSystem {
		t.Fatalf("expected member default theme %q, got %q", ThemeSystem, m.Theme)
	}

	// Update theme to light without changing email or password.
	updated, err := svc.UpdateAccount(ctx, u.ID, 0, "", "", "", ThemeLight, nil)
	if err != nil {
		t.Fatalf("UpdateAccount theme=light: %v", err)
	}
	if updated.Theme != ThemeLight || updated.Email != "admin@example.com" {
		t.Fatalf("unexpected updated user: %+v", updated)
	}

	// Verify persisted across GetUser, ListUsers, Authenticate, and ValidateToken.
	tok, _, err := svc.CreateSession(ctx, u.ID, SessionKindBearer, "test", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	fromTok, _, err := svc.ValidateToken(ctx, tok)
	if err != nil || fromTok.Theme != ThemeLight {
		t.Fatalf("ValidateToken expected theme %q, got %+v err=%v", ThemeLight, fromTok, err)
	}
	fromAuth, err := svc.Authenticate(ctx, "admin@example.com", "password123")
	if err != nil || fromAuth.Theme != ThemeLight {
		t.Fatalf("Authenticate expected theme %q, got %+v err=%v", ThemeLight, fromAuth, err)
	}

	// Invalid theme is rejected without changing stored value.
	if _, err := svc.UpdateAccount(ctx, u.ID, 0, "", "", "", "sepia", nil); err != ErrInvalidTheme {
		t.Fatalf("expected ErrInvalidTheme, got %v", err)
	}
	reloaded, err := svc.GetUser(ctx, u.ID)
	if err != nil || reloaded.Theme != ThemeLight {
		t.Fatalf("expected stored theme to remain %q, got %+v err=%v", ThemeLight, reloaded, err)
	}
}

func TestUserQuickActionsPreference(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	svc := NewService(conn)
	ctx := context.Background()

	u, err := svc.SetupAdmin(ctx, "admin@example.com", "password123")
	if err != nil {
		t.Fatalf("SetupAdmin: %v", err)
	}
	if !u.QuickActionsEnabled {
		t.Fatalf("expected default quick_actions_enabled=true, got false")
	}

	m, err := svc.CreateUser(ctx, "member@example.com", "password123", RoleMember)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if !m.QuickActionsEnabled {
		t.Fatalf("expected member default quick_actions_enabled=true, got false")
	}

	// Toggle off independently of email/password/theme.
	disabled := false
	updated, err := svc.UpdateAccount(ctx, u.ID, 0, "", "", "", "", &disabled)
	if err != nil {
		t.Fatalf("UpdateAccount quick_actions_enabled=false: %v", err)
	}
	if updated.QuickActionsEnabled || updated.Email != "admin@example.com" || updated.Theme != ThemeSystem {
		t.Fatalf("unexpected updated user: %+v", updated)
	}

	// Persists across ValidateToken, Authenticate, GetUser, and ListUsers.
	tok, _, err := svc.CreateSession(ctx, u.ID, SessionKindBearer, "test", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	fromTok, _, err := svc.ValidateToken(ctx, tok)
	if err != nil || fromTok.QuickActionsEnabled {
		t.Fatalf("ValidateToken expected quick_actions_enabled=false, got %+v err=%v", fromTok, err)
	}
	fromAuth, err := svc.Authenticate(ctx, "admin@example.com", "password123")
	if err != nil || fromAuth.QuickActionsEnabled {
		t.Fatalf("Authenticate expected quick_actions_enabled=false, got %+v err=%v", fromAuth, err)
	}
	users, err := svc.ListUsers(ctx)
	if err != nil || len(users) != 2 || users[0].QuickActionsEnabled || !users[1].QuickActionsEnabled {
		t.Fatalf("ListUsers unexpected quick_actions_enabled values: %+v err=%v", users, err)
	}

	// Toggle back on.
	enabled := true
	updated, err = svc.UpdateAccount(ctx, u.ID, 0, "", "", "", "", &enabled)
	if err != nil || !updated.QuickActionsEnabled {
		t.Fatalf("UpdateAccount quick_actions_enabled=true failed: user=%+v err=%v", updated, err)
	}
}
