package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

const (
	APITokenPrefix      = "itm_"
	maxAPITokenNameLen  = 100
	maxAPITokenDays     = 3650
	lastUsedUpdateEvery = 5 * time.Minute
)

var (
	ErrAPITokenNotFound    = errors.New("api token not found")
	ErrInvalidAPITokenName = errors.New("token name is required")
	ErrInvalidAPITokenTTL  = errors.New("expires_in_days must be between 1 and 3650")
)

type APIToken struct {
	ID          int64   `json:"id"`
	UserID      int64   `json:"user_id"`
	Name        string  `json:"name"`
	TokenPrefix string  `json:"token_prefix"`
	LastUsedAt  *string `json:"last_used_at"`
	ExpiresAt   *string `json:"expires_at"`
	CreatedAt   string  `json:"created_at"`
}

// CreateAPIToken creates a named Personal API Token for userID, storing only its
// SHA-256 hash and short prefix. The plaintext raw token is returned once.
func (s *Service) CreateAPIToken(ctx context.Context, userID int64, name string, expiresInDays *int) (string, *APIToken, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || len(trimmed) > maxAPITokenNameLen {
		return "", nil, ErrInvalidAPITokenName
	}

	var expiresAt *string
	now := time.Now().UTC()
	if expiresInDays != nil {
		if *expiresInDays < 1 || *expiresInDays > maxAPITokenDays {
			return "", nil, ErrInvalidAPITokenTTL
		}
		exp := now.AddDate(0, 0, *expiresInDays).Format(time.RFC3339)
		expiresAt = &exp
	}

	randPart, err := generateRandomToken(32)
	if err != nil {
		return "", nil, err
	}
	rawToken := APITokenPrefix + randPart
	prefix := rawToken
	if len(prefix) > 12 {
		prefix = prefix[:12]
	}
	createdAt := now.Format(time.RFC3339)

	res, err := s.db.ExecContext(ctx, `
		INSERT INTO api_tokens (user_id, name, token_prefix, token_hash, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, userID, trimmed, prefix, HashToken(rawToken), expiresAt, createdAt)
	if err != nil {
		return "", nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return "", nil, err
	}

	return rawToken, &APIToken{
		ID:          id,
		UserID:      userID,
		Name:        trimmed,
		TokenPrefix: prefix,
		LastUsedAt:  nil,
		ExpiresAt:   expiresAt,
		CreatedAt:   createdAt,
	}, nil
}

// ListAPITokens returns all Personal API Tokens owned by userID (metadata only).
func (s *Service) ListAPITokens(ctx context.Context, userID int64) ([]APIToken, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, name, token_prefix, last_used_at, expires_at, created_at
		FROM api_tokens
		WHERE user_id = ?
		ORDER BY id DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := []APIToken{}
	for rows.Next() {
		var t APIToken
		var lastUsed, expires sql.NullString
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name, &t.TokenPrefix, &lastUsed, &expires, &t.CreatedAt); err != nil {
			return nil, err
		}
		if lastUsed.Valid {
			t.LastUsedAt = &lastUsed.String
		}
		if expires.Valid {
			t.ExpiresAt = &expires.String
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

// RevokeAPIToken deletes a Personal API Token owned by userID.
func (s *Service) RevokeAPIToken(ctx context.Context, userID, tokenID int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM api_tokens WHERE id = ? AND user_id = ?`, tokenID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrAPITokenNotFound
	}
	return nil
}

func (s *Service) validateAPIToken(ctx context.Context, rawToken string) (*User, *Session, error) {
	var tokenID int64
	var lastUsed, expires sql.NullString
	var u User
	var quickActions int
	var iss, sub sql.NullString

	err := s.db.QueryRowContext(ctx, `
		SELECT
			t.id, t.last_used_at, t.expires_at,
			u.id, u.email, u.role, u.theme, u.quick_actions_enabled, u.oidc_issuer, u.oidc_subject, u.created_at, u.updated_at
		FROM api_tokens t
		JOIN users u ON u.id = t.user_id
		WHERE t.token_hash = ?
	`, HashToken(rawToken)).Scan(
		&tokenID, &lastUsed, &expires,
		&u.ID, &u.Email, &u.Role, &u.Theme, &quickActions, &iss, &sub, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrUnauthorized
	}
	if err != nil {
		return nil, nil, err
	}

	now := time.Now().UTC()
	if expires.Valid && expires.String != "" {
		exp, err := time.Parse(time.RFC3339, expires.String)
		if err != nil || now.After(exp) {
			return nil, nil, ErrUnauthorized
		}
	}

	u.QuickActionsEnabled = quickActions != 0
	if iss.Valid {
		u.OIDCIssuer = &iss.String
	}
	if sub.Valid {
		u.OIDCSubject = &sub.String
	}

	// Throttled last_used_at update to avoid excessive SQLite writes on tight polling.
	shouldTouch := !lastUsed.Valid || lastUsed.String == ""
	if !shouldTouch {
		if prev, err := time.Parse(time.RFC3339, lastUsed.String); err != nil || now.Sub(prev) >= lastUsedUpdateEvery {
			shouldTouch = true
		}
	}
	if shouldTouch {
		_, _ = s.db.ExecContext(ctx, `UPDATE api_tokens SET last_used_at = ? WHERE id = ?`, now.Format(time.RFC3339), tokenID)
	}

	return &u, nil, nil
}
