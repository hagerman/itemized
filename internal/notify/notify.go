package notify

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"itemized/internal/db"
)

const (
	ChannelWebPush = "web_push"

	TopicExpiration   = "expiration"
	TopicShoppingList = "shopping_list"
	TopicTest         = "test"

	DefaultDigestTime = "08:30"

	settingVAPIDPublicKey  = "vapid_public_key"
	settingVAPIDPrivateKey = "vapid_private_key"
)

var (
	// ErrTargetGone indicates the remote delivery endpoint is permanently invalid
	// (e.g. HTTP 404 or 410 from a push service) and the target should be pruned.
	ErrTargetGone = errors.New("notification target is gone")

	// ErrTargetNotFound indicates the requested target does not exist or does not belong to the user.
	ErrTargetNotFound = errors.New("notification target not found")

	// ErrInvalidDigestTime indicates a digest_time value is not valid 24-hour HH:MM.
	ErrInvalidDigestTime = errors.New("digest_time must be in 24-hour HH:MM format")

	// ErrInvalidTarget indicates a target payload failed validation.
	ErrInvalidTarget = errors.New("invalid notification target")

	hhmmRegex = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
)

// Message is a channel-agnostic notification payload.
type Message struct {
	Topic string `json:"topic"`
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag,omitempty"`
}

// Target represents a persisted delivery target owned by a user.
type Target struct {
	ID         int64
	UserID     int64
	Channel    string
	Label      string
	ConfigJSON string
	DedupeKey  string
	CreatedAt  string
	LastUsedAt *string
	LastError  *string
}

// TargetSummary is the safe public representation of a Target returned by the API
// without exposing raw Web Push encryption keys.
type TargetSummary struct {
	ID         int64   `json:"id"`
	Channel    string  `json:"channel"`
	Label      string  `json:"label"`
	CreatedAt  string  `json:"created_at"`
	LastUsedAt *string `json:"last_used_at"`
	LastError  *string `json:"last_error"`
}

// WebPushConfig is the JSON configuration stored in notification_targets.config_json
// for web_push targets.
type WebPushConfig struct {
	Endpoint string `json:"endpoint"`
	P256DH   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

// Preferences holds a user's daily digest notification settings.
type Preferences struct {
	UserID                   int64   `json:"-"`
	DigestTime               string  `json:"digest_time"`
	ExpirationEnabled        bool    `json:"expiration_enabled"`
	ShoppingListEnabled      bool    `json:"shopping_list_enabled"`
	ExpirationLastSentDate   *string `json:"-"`
	ShoppingListLastSentDate *string `json:"-"`
	UpdatedAt                string  `json:"updated_at,omitempty"`
}

// VAPIDKeys holds the server's VAPID ECDSA P-256 keypair.
type VAPIDKeys struct {
	PublicKey  string
	PrivateKey string
}

// Channel delivers a Message to a Target over a specific transport (e.g. web_push).
type Channel interface {
	Type() string
	Send(ctx context.Context, target Target, msg Message) error
}

// DeliveryResult summarizes a fan-out delivery attempt across a user's targets.
type DeliveryResult struct {
	Sent   int `json:"sent"`
	Failed int `json:"failed"`
	Pruned int `json:"pruned"`
}

// ValidateDigestTime validates a 24-hour HH:MM time string.
func ValidateDigestTime(v string) error {
	if !hhmmRegex.MatchString(v) {
		return ErrInvalidDigestTime
	}
	return nil
}

// Store handles SQLite persistence for VAPID keys, user preferences, and targets.
type Store struct {
	db *sql.DB
}

// NewStore creates a Store backed by conn.
func NewStore(conn *sql.DB) *Store {
	return &Store{db: conn}
}

// DB returns the underlying *sql.DB.
func (s *Store) DB() *sql.DB {
	return s.db
}

// EnsureVAPIDKeys returns the persisted VAPID keypair, generating and storing a new
// keypair in the settings table if one does not yet exist.
func (s *Store) EnsureVAPIDKeys(ctx context.Context) (VAPIDKeys, error) {
	pub, err := s.getSetting(ctx, settingVAPIDPublicKey)
	if err != nil {
		return VAPIDKeys{}, err
	}
	priv, err := s.getSetting(ctx, settingVAPIDPrivateKey)
	if err != nil {
		return VAPIDKeys{}, err
	}
	if pub != "" && priv != "" {
		return VAPIDKeys{PublicKey: pub, PrivateKey: priv}, nil
	}

	privKey, pubKey, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return VAPIDKeys{}, fmt.Errorf("generate VAPID keys: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return VAPIDKeys{}, fmt.Errorf("begin VAPID tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// Re-check inside transaction in case another caller initialized concurrently.
	var existingPub, existingPriv string
	_ = tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, settingVAPIDPublicKey).Scan(&existingPub)
	_ = tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, settingVAPIDPrivateKey).Scan(&existingPriv)
	if existingPub != "" && existingPriv != "" {
		return VAPIDKeys{PublicKey: existingPub, PrivateKey: existingPriv}, nil
	}

	now := db.NowUTC()
	for k, v := range map[string]string{
		settingVAPIDPublicKey:  pubKey,
		settingVAPIDPrivateKey: privKey,
	} {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
		`, k, v, now); err != nil {
			return VAPIDKeys{}, fmt.Errorf("store %s: %w", k, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return VAPIDKeys{}, fmt.Errorf("commit VAPID keys: %w", err)
	}
	return VAPIDKeys{PublicKey: pubKey, PrivateKey: privKey}, nil
}

func (s *Store) getSetting(ctx context.Context, key string) (string, error) {
	var val string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&val)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return val, nil
}

// GetPreferences returns a user's notification preferences, falling back to defaults
// if the user has not saved preferences yet.
func (s *Store) GetPreferences(ctx context.Context, userID int64) (Preferences, error) {
	prefs := Preferences{
		UserID:     userID,
		DigestTime: DefaultDigestTime,
	}
	var expInt, shopInt int
	var expSent, shopSent sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT digest_time, expiration_enabled, shopping_list_enabled,
		       expiration_last_sent_date, shopping_list_last_sent_date, updated_at
		FROM notification_preferences
		WHERE user_id = ?
	`, userID).Scan(&prefs.DigestTime, &expInt, &shopInt, &expSent, &shopSent, &prefs.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return prefs, nil
	}
	if err != nil {
		return Preferences{}, fmt.Errorf("get notification preferences: %w", err)
	}
	prefs.ExpirationEnabled = expInt != 0
	prefs.ShoppingListEnabled = shopInt != 0
	if expSent.Valid {
		prefs.ExpirationLastSentDate = &expSent.String
	}
	if shopSent.Valid {
		prefs.ShoppingListLastSentDate = &shopSent.String
	}
	return prefs, nil
}

// UpdatePreferences validates and persists a user's digest preferences.
func (s *Store) UpdatePreferences(ctx context.Context, userID int64, digestTime string, expirationEnabled, shoppingListEnabled bool) (Preferences, error) {
	digestTime = strings.TrimSpace(digestTime)
	if err := ValidateDigestTime(digestTime); err != nil {
		return Preferences{}, err
	}
	expInt := 0
	if expirationEnabled {
		expInt = 1
	}
	shopInt := 0
	if shoppingListEnabled {
		shopInt = 1
	}
	now := db.NowUTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO notification_preferences (
			user_id, digest_time, expiration_enabled, shopping_list_enabled, updated_at
		) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			digest_time = excluded.digest_time,
			expiration_enabled = excluded.expiration_enabled,
			shopping_list_enabled = excluded.shopping_list_enabled,
			updated_at = excluded.updated_at
	`, userID, digestTime, expInt, shopInt, now)
	if err != nil {
		return Preferences{}, fmt.Errorf("update notification preferences: %w", err)
	}
	return s.GetPreferences(ctx, userID)
}

// MarkDigestSent records today's local date (YYYY-MM-DD) for the given user and topic.
func (s *Store) MarkDigestSent(ctx context.Context, userID int64, topic, localDate string) error {
	var col string
	switch topic {
	case TopicExpiration:
		col = "expiration_last_sent_date"
	case TopicShoppingList:
		col = "shopping_list_last_sent_date"
	default:
		return fmt.Errorf("unknown digest topic %q", topic)
	}
	_, err := s.db.ExecContext(ctx, fmt.Sprintf(`
		UPDATE notification_preferences SET %s = ? WHERE user_id = ?
	`, col), localDate, userID)
	return err
}

// ListActivePreferences returns preferences for all users who have at least one
// digest enabled and at least one registered target.
func (s *Store) ListActivePreferences(ctx context.Context) ([]Preferences, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.user_id, p.digest_time, p.expiration_enabled, p.shopping_list_enabled,
		       p.expiration_last_sent_date, p.shopping_list_last_sent_date, p.updated_at
		FROM notification_preferences p
		WHERE (p.expiration_enabled = 1 OR p.shopping_list_enabled = 1)
		  AND EXISTS (SELECT 1 FROM notification_targets t WHERE t.user_id = p.user_id)
		ORDER BY p.user_id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list active preferences: %w", err)
	}
	defer rows.Close()

	var result []Preferences
	for rows.Next() {
		var p Preferences
		var expInt, shopInt int
		var expSent, shopSent sql.NullString
		if err := rows.Scan(&p.UserID, &p.DigestTime, &expInt, &shopInt, &expSent, &shopSent, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan active preferences: %w", err)
		}
		p.ExpirationEnabled = expInt != 0
		p.ShoppingListEnabled = shopInt != 0
		if expSent.Valid {
			p.ExpirationLastSentDate = &expSent.String
		}
		if shopSent.Valid {
			p.ShoppingListLastSentDate = &shopSent.String
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// UpsertWebPushTarget registers or updates a Web Push target for a user.
// Re-registering the same endpoint for the same user updates keys/label idempotently.
func (s *Store) UpsertWebPushTarget(ctx context.Context, userID int64, label string, cfg WebPushConfig) (TargetSummary, error) {
	cfg.Endpoint = strings.TrimSpace(cfg.Endpoint)
	cfg.P256DH = strings.TrimSpace(cfg.P256DH)
	cfg.Auth = strings.TrimSpace(cfg.Auth)
	label = strings.TrimSpace(label)

	if cfg.Endpoint == "" || cfg.P256DH == "" || cfg.Auth == "" {
		return TargetSummary{}, fmt.Errorf("%w: endpoint, p256dh, and auth are required", ErrInvalidTarget)
	}
	if !strings.HasPrefix(cfg.Endpoint, "https://") && !strings.HasPrefix(cfg.Endpoint, "http://127.0.0.1") && !strings.HasPrefix(cfg.Endpoint, "http://localhost") {
		return TargetSummary{}, fmt.Errorf("%w: endpoint must use https", ErrInvalidTarget)
	}
	if len(label) > 100 {
		label = label[:100]
	}

	rawCfg, err := json.Marshal(cfg)
	if err != nil {
		return TargetSummary{}, fmt.Errorf("marshal web push config: %w", err)
	}

	sum := sha256.Sum256([]byte(cfg.Endpoint))
	dedupeKey := hex.EncodeToString(sum[:])
	now := db.NowUTC()

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO notification_targets (
			user_id, channel, label, config_json, dedupe_key, created_at
		) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, channel, dedupe_key) DO UPDATE SET
			label = CASE WHEN excluded.label != '' THEN excluded.label ELSE notification_targets.label END,
			config_json = excluded.config_json,
			last_error = NULL
	`, userID, ChannelWebPush, label, string(rawCfg), dedupeKey, now)
	if err != nil {
		return TargetSummary{}, fmt.Errorf("upsert web push target: %w", err)
	}

	var out TargetSummary
	var lastUsed, lastErr sql.NullString
	err = s.db.QueryRowContext(ctx, `
		SELECT id, channel, label, created_at, last_used_at, last_error
		FROM notification_targets
		WHERE user_id = ? AND channel = ? AND dedupe_key = ?
	`, userID, ChannelWebPush, dedupeKey).Scan(&out.ID, &out.Channel, &out.Label, &out.CreatedAt, &lastUsed, &lastErr)
	if err != nil {
		return TargetSummary{}, fmt.Errorf("reload web push target: %w", err)
	}
	if lastUsed.Valid {
		out.LastUsedAt = &lastUsed.String
	}
	if lastErr.Valid {
		out.LastError = &lastErr.String
	}
	return out, nil
}

// ListTargets returns all full Target records for a user (for internal dispatch).
func (s *Store) ListTargets(ctx context.Context, userID int64) ([]Target, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, channel, label, config_json, dedupe_key, created_at, last_used_at, last_error
		FROM notification_targets
		WHERE user_id = ?
		ORDER BY created_at DESC, id DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list targets: %w", err)
	}
	defer rows.Close()

	var targets []Target
	for rows.Next() {
		var t Target
		var lastUsed, lastErr sql.NullString
		if err := rows.Scan(&t.ID, &t.UserID, &t.Channel, &t.Label, &t.ConfigJSON, &t.DedupeKey, &t.CreatedAt, &lastUsed, &lastErr); err != nil {
			return nil, fmt.Errorf("scan target: %w", err)
		}
		if lastUsed.Valid {
			t.LastUsedAt = &lastUsed.String
		}
		if lastErr.Valid {
			t.LastError = &lastErr.String
		}
		targets = append(targets, t)
	}
	return targets, rows.Err()
}

// ListTargetSummaries returns safe summaries of a user's enrolled targets for API responses.
func (s *Store) ListTargetSummaries(ctx context.Context, userID int64) ([]TargetSummary, error) {
	targets, err := s.ListTargets(ctx, userID)
	if err != nil {
		return nil, err
	}
	summaries := make([]TargetSummary, 0, len(targets))
	for _, t := range targets {
		summaries = append(summaries, TargetSummary{
			ID:         t.ID,
			Channel:    t.Channel,
			Label:      t.Label,
			CreatedAt:  t.CreatedAt,
			LastUsedAt: t.LastUsedAt,
			LastError:  t.LastError,
		})
	}
	return summaries, nil
}

// DeleteTarget removes a target owned by userID. Returns ErrTargetNotFound if no matching row exists.
func (s *Store) DeleteTarget(ctx context.Context, userID, targetID int64) error {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM notification_targets WHERE id = ? AND user_id = ?
	`, targetID, userID)
	if err != nil {
		return fmt.Errorf("delete target: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrTargetNotFound
	}
	return nil
}

// DeleteTargetByID deletes a target by ID (used when pruning stale endpoints).
func (s *Store) DeleteTargetByID(ctx context.Context, targetID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM notification_targets WHERE id = ?`, targetID)
	return err
}

// RecordTargetSuccess updates last_used_at and clears last_error for a target.
func (s *Store) RecordTargetSuccess(ctx context.Context, targetID int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE notification_targets SET last_used_at = ?, last_error = NULL WHERE id = ?
	`, db.NowUTC(), targetID)
	return err
}

// RecordTargetError stores the latest delivery error message for a target.
func (s *Store) RecordTargetError(ctx context.Context, targetID int64, errMsg string) error {
	if len(errMsg) > 300 {
		errMsg = errMsg[:300]
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE notification_targets SET last_error = ? WHERE id = ?
	`, errMsg, targetID)
	return err
}

// GetBaseURL returns the configured instance base_url from settings, if any.
func (s *Store) GetBaseURL(ctx context.Context) string {
	val, _ := s.getSetting(ctx, "base_url")
	return strings.TrimSpace(val)
}

// LocalTimezoneName returns the server's current local timezone name (from TZ / time.Local).
func LocalTimezoneName() string {
	loc := time.Now().Location()
	if loc == nil {
		return "UTC"
	}
	name := loc.String()
	if name == "" || name == "Local" {
		tz, _ := time.Now().Zone()
		if tz != "" {
			return tz
		}
		return "Local"
	}
	return name
}
