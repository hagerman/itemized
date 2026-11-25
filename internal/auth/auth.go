package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"itemized/internal/db"
)

const (
	SessionCookieName = "itemized_session"
	DefaultSessionTTL = 30 * 24 * time.Hour
	RoleAdmin         = "admin"
	RoleMember        = "member"
	SessionKindCookie = "cookie"
	SessionKindBearer = "bearer"
)

var (
	ErrAlreadyInitialized = errors.New("application already initialized")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUnauthorized       = errors.New("unauthorized")
	ErrForbidden          = errors.New("forbidden")
	ErrUserNotFound       = errors.New("user not found")
	ErrDuplicateEmail     = errors.New("email already in use")
	ErrInvalidRole        = errors.New("invalid role")
	ErrLastAdmin          = errors.New("cannot demote the last administrator")
)

type User struct {
	ID          int64   `json:"id"`
	Email       string  `json:"email"`
	Role        string  `json:"role"`
	OIDCIssuer  *string `json:"oidc_issuer,omitempty"`
	OIDCSubject *string `json:"oidc_subject,omitempty"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func (u *User) IsAdmin() bool {
	return u != nil && u.Role == RoleAdmin
}

type Session struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Kind      string `json:"kind"`
	UserAgent string `json:"user_agent,omitempty"`
	IPAddress string `json:"ip_address,omitempty"`
	ExpiresAt string `json:"expires_at"`
	CreatedAt string `json:"created_at"`
}

type Service struct {
	db *sql.DB
}

func NewService(conn *sql.DB) *Service {
	return &Service{db: conn}
}

func HashPassword(password string) (string, error) {
	if len(password) < 8 {
		return "", errors.New("password must be at least 8 characters")
	}
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func CheckPassword(hash, password string) bool {
	if hash == "" || password == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func generateRandomToken(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (s *Service) UserCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM users`).Scan(&count)
	return count, err
}

func (s *Service) SetupAdmin(ctx context.Context, email, password string) (*User, error) {
	email = normalizeEmail(email)
	if email == "" {
		return nil, errors.New("email is required")
	}
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(1) FROM users`).Scan(&count); err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, ErrAlreadyInitialized
	}

	now := db.NowUTC()
	res, err := tx.ExecContext(ctx, `
		INSERT INTO users (email, password_hash, role, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, email, hash, RoleAdmin, now, now)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &User{
		ID:        id,
		Email:     email,
		Role:      RoleAdmin,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (s *Service) CreateUser(ctx context.Context, email, password, role string) (*User, error) {
	email = normalizeEmail(email)
	if email == "" {
		return nil, errors.New("email is required")
	}
	if role == "" {
		role = RoleMember
	}
	if role != RoleAdmin && role != RoleMember {
		return nil, ErrInvalidRole
	}
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	now := db.NowUTC()
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO users (email, password_hash, role, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, email, hash, role, now, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, ErrDuplicateEmail
		}
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &User{
		ID:        id,
		Email:     email,
		Role:      role,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (s *Service) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, email, role, oidc_issuer, oidc_subject, created_at, updated_at
		FROM users
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var iss, sub sql.NullString
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &iss, &sub, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		if iss.Valid {
			u.OIDCIssuer = &iss.String
		}
		if sub.Valid {
			u.OIDCSubject = &sub.String
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *Service) GetUser(ctx context.Context, id int64) (*User, error) {
	var u User
	var iss, sub sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, role, oidc_issuer, oidc_subject, created_at, updated_at
		FROM users WHERE id = ?
	`, id).Scan(&u.ID, &u.Email, &u.Role, &iss, &sub, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	if iss.Valid {
		u.OIDCIssuer = &iss.String
	}
	if sub.Valid {
		u.OIDCSubject = &sub.String
	}
	return &u, nil
}

func (s *Service) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	var iss, sub sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, role, oidc_issuer, oidc_subject, created_at, updated_at
		FROM users WHERE email = ?
	`, normalizeEmail(email)).Scan(&u.ID, &u.Email, &u.Role, &iss, &sub, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	if iss.Valid {
		u.OIDCIssuer = &iss.String
	}
	if sub.Valid {
		u.OIDCSubject = &sub.String
	}
	return &u, nil
}

func (s *Service) UpdateUserRole(ctx context.Context, id int64, role string) (*User, error) {
	if role != RoleAdmin && role != RoleMember {
		return nil, ErrInvalidRole
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var currentRole string
	err = tx.QueryRowContext(ctx, `SELECT role FROM users WHERE id = ?`, id).Scan(&currentRole)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	if currentRole == RoleAdmin && role == RoleMember {
		var adminCount int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(1) FROM users WHERE role = ?`, RoleAdmin).Scan(&adminCount); err != nil {
			return nil, err
		}
		if adminCount <= 1 {
			return nil, ErrLastAdmin
		}
	}

	now := db.NowUTC()
	if _, err := tx.ExecContext(ctx, `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`, role, now, id); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetUser(ctx, id)
}

func (s *Service) ResetPassword(ctx context.Context, id int64, newPassword string) error {
	hash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := db.NowUTC()
	res, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hash, now, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrUserNotFound
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) DeleteUser(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (s *Service) UpdateAccount(ctx context.Context, userID, currentSessionID int64, email, currentPassword, newPassword string) (*User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var existingEmail, existingHash string
	err = tx.QueryRowContext(ctx, `SELECT email, password_hash FROM users WHERE id = ?`, userID).Scan(&existingEmail, &existingHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	nextEmail := existingEmail
	if strings.TrimSpace(email) != "" {
		nextEmail = normalizeEmail(email)
	}

	nextHash := existingHash
	if newPassword != "" {
		if !CheckPassword(existingHash, currentPassword) {
			return nil, ErrInvalidCredentials
		}
		h, err := HashPassword(newPassword)
		if err != nil {
			return nil, err
		}
		nextHash = h
	}

	now := db.NowUTC()
	_, err = tx.ExecContext(ctx, `
		UPDATE users SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?
	`, nextEmail, nextHash, now, userID)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, ErrDuplicateEmail
		}
		return nil, err
	}

	if newPassword != "" {
		if currentSessionID > 0 {
			if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND id != ?`, userID, currentSessionID); err != nil {
				return nil, err
			}
		} else {
			if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID); err != nil {
				return nil, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetUser(ctx, userID)
}

func (s *Service) Authenticate(ctx context.Context, email, password string) (*User, error) {
	email = normalizeEmail(email)
	var u User
	var hash string
	var iss, sub sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, password_hash, role, oidc_issuer, oidc_subject, created_at, updated_at
		FROM users WHERE email = ?
	`, email).Scan(&u.ID, &u.Email, &hash, &u.Role, &iss, &sub, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}
	if !CheckPassword(hash, password) {
		return nil, ErrInvalidCredentials
	}
	if iss.Valid {
		u.OIDCIssuer = &iss.String
	}
	if sub.Valid {
		u.OIDCSubject = &sub.String
	}
	return &u, nil
}

func (s *Service) CreateSession(ctx context.Context, userID int64, kind, userAgent, ip string, ttl time.Duration) (string, *Session, error) {
	if kind != SessionKindCookie && kind != SessionKindBearer {
		kind = SessionKindCookie
	}
	if ttl <= 0 {
		ttl = DefaultSessionTTL
	}
	raw, err := generateRandomToken(32)
	if err != nil {
		return "", nil, err
	}
	now := time.Now().UTC()
	expiresAt := now.Add(ttl).Format(time.RFC3339)
	createdAt := now.Format(time.RFC3339)

	res, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (user_id, token_hash, kind, user_agent, ip_address, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, userID, HashToken(raw), kind, userAgent, ip, expiresAt, createdAt)
	if err != nil {
		return "", nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return "", nil, err
	}
	return raw, &Session{
		ID:        id,
		UserID:    userID,
		Kind:      kind,
		UserAgent: userAgent,
		IPAddress: ip,
		ExpiresAt: expiresAt,
		CreatedAt: createdAt,
	}, nil
}

func (s *Service) ValidateToken(ctx context.Context, rawToken string) (*User, *Session, error) {
	if rawToken == "" {
		return nil, nil, ErrUnauthorized
	}
	var u User
	var sess Session
	var iss, sub, ua, ip sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT
			s.id, s.user_id, s.kind, s.user_agent, s.ip_address, s.expires_at, s.created_at,
			u.id, u.email, u.role, u.oidc_issuer, u.oidc_subject, u.created_at, u.updated_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ?
	`, HashToken(rawToken)).Scan(
		&sess.ID, &sess.UserID, &sess.Kind, &ua, &ip, &sess.ExpiresAt, &sess.CreatedAt,
		&u.ID, &u.Email, &u.Role, &iss, &sub, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrUnauthorized
	}
	if err != nil {
		return nil, nil, err
	}

	exp, err := time.Parse(time.RFC3339, sess.ExpiresAt)
	if err != nil || time.Now().UTC().After(exp) {
		_ = s.RevokeSession(ctx, sess.ID)
		return nil, nil, ErrUnauthorized
	}

	if ua.Valid {
		sess.UserAgent = ua.String
	}
	if ip.Valid {
		sess.IPAddress = ip.String
	}
	if iss.Valid {
		u.OIDCIssuer = &iss.String
	}
	if sub.Valid {
		u.OIDCSubject = &sub.String
	}
	return &u, &sess, nil
}

func (s *Service) RevokeSession(ctx context.Context, sessionID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, sessionID)
	return err
}

func (s *Service) RevokeToken(ctx context.Context, rawToken string) error {
	if rawToken == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, HashToken(rawToken))
	return err
}

// FindOrLinkOIDCUser resolves an OIDC identity to a local user.
// 1. Exact match on (oidc_issuer, oidc_subject).
// 2. Match by verified email -> links (oidc_issuer, oidc_subject) to that existing user.
// 3. If autoProvision is true, creates a new member user (or admin if DB is empty).
func (s *Service) FindOrLinkOIDCUser(ctx context.Context, issuer, subject, email string, autoProvision bool) (*User, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `
		SELECT id FROM users WHERE oidc_issuer = ? AND oidc_subject = ?
	`, issuer, subject).Scan(&id)
	if err == nil {
		return s.GetUser(ctx, id)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	normEmail := normalizeEmail(email)
	if normEmail != "" {
		err = s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = ?`, normEmail).Scan(&id)
		if err == nil {
			now := db.NowUTC()
			if _, err := s.db.ExecContext(ctx, `
				UPDATE users SET oidc_issuer = ?, oidc_subject = ?, updated_at = ? WHERE id = ?
			`, issuer, subject, now, id); err != nil {
				return nil, err
			}
			return s.GetUser(ctx, id)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}

	if !autoProvision {
		return nil, ErrUnauthorized
	}
	if normEmail == "" {
		return nil, fmt.Errorf("oidc user missing email")
	}

	count, err := s.UserCount(ctx)
	if err != nil {
		return nil, err
	}
	role := RoleMember
	if count == 0 {
		role = RoleAdmin
	}

	randomPass, err := generateRandomToken(32)
	if err != nil {
		return nil, err
	}
	hash, err := HashPassword(randomPass)
	if err != nil {
		return nil, err
	}
	now := db.NowUTC()
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO users (email, password_hash, role, oidc_issuer, oidc_subject, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, normEmail, hash, role, issuer, subject, now, now)
	if err != nil {
		return nil, err
	}
	newID, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return s.GetUser(ctx, newID)
}

type ctxKey int

const (
	userCtxKey ctxKey = iota
	sessionCtxKey
)

func WithAuth(ctx context.Context, u *User, s *Session) context.Context {
	ctx = context.WithValue(ctx, userCtxKey, u)
	ctx = context.WithValue(ctx, sessionCtxKey, s)
	return ctx
}

func UserFromContext(ctx context.Context) *User {
	u, _ := ctx.Value(userCtxKey).(*User)
	return u
}

func SessionFromContext(ctx context.Context) *Session {
	s, _ := ctx.Value(sessionCtxKey).(*Session)
	return s
}

// ExtractToken extracts the raw auth token from Authorization: Bearer or session cookie.
func ExtractToken(r *http.Request) string {
	authz := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(authz) > 7 && strings.EqualFold(authz[:7], "Bearer ") {
		return strings.TrimSpace(authz[7:])
	}
	if c, err := r.Cookie(SessionCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	return ""
}

// RequireAuth middleware validates either Bearer token or session cookie.
func RequireAuth(svc *Service, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := ExtractToken(r)
		u, sess, err := svc.ValidateToken(r.Context(), tok)
		if err != nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(WithAuth(r.Context(), u, sess)))
	})
}

// RequireAdmin middleware ensures the authenticated user has admin role.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := UserFromContext(r.Context())
		if !u.IsAdmin() {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func SetSessionCookie(w http.ResponseWriter, r *http.Request, rawToken string, ttl time.Duration) {
	if ttl <= 0 {
		ttl = DefaultSessionTTL
	}
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    rawToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		MaxAge:   int(ttl.Seconds()),
	})
}

func ClearSessionCookie(w http.ResponseWriter, r *http.Request) {
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		MaxAge:   -1,
	})
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
