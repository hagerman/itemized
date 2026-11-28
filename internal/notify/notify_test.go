package notify_test

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"itemized/internal/db"
	"itemized/internal/notify"
)

func openTestDB(t *testing.T) (*sql.DB, int64, int64) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "notify.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	now := db.NowUTC()
	res1, err := conn.Exec(`INSERT INTO users (email, password_hash, role, created_at, updated_at) VALUES ('a@example.com', 'hash', 'admin', ?, ?)`, now, now)
	if err != nil {
		t.Fatalf("insert user 1: %v", err)
	}
	u1, _ := res1.LastInsertId()

	res2, err := conn.Exec(`INSERT INTO users (email, password_hash, role, created_at, updated_at) VALUES ('b@example.com', 'hash', 'member', ?, ?)`, now, now)
	if err != nil {
		t.Fatalf("insert user 2: %v", err)
	}
	u2, _ := res2.LastInsertId()

	return conn, u1, u2
}

func TestVAPIDKeysIdempotent(t *testing.T) {
	conn, _, _ := openTestDB(t)
	store := notify.NewStore(conn)
	ctx := context.Background()

	k1, err := store.EnsureVAPIDKeys(ctx)
	if err != nil {
		t.Fatalf("EnsureVAPIDKeys 1: %v", err)
	}
	if k1.PublicKey == "" || k1.PrivateKey == "" {
		t.Fatalf("expected non-empty VAPID keys")
	}

	k2, err := store.EnsureVAPIDKeys(ctx)
	if err != nil {
		t.Fatalf("EnsureVAPIDKeys 2: %v", err)
	}
	if k1.PublicKey != k2.PublicKey || k1.PrivateKey != k2.PrivateKey {
		t.Fatalf("expected identical persisted VAPID keys across calls")
	}
}

func TestPreferencesDefaultsUpdateAndValidation(t *testing.T) {
	conn, u1, u2 := openTestDB(t)
	store := notify.NewStore(conn)
	ctx := context.Background()

	p1, err := store.GetPreferences(ctx, u1)
	if err != nil {
		t.Fatalf("GetPreferences default: %v", err)
	}
	if p1.DigestTime != notify.DefaultDigestTime || p1.ExpirationEnabled || p1.ShoppingListEnabled {
		t.Fatalf("unexpected defaults: %+v", p1)
	}

	if _, err := store.UpdatePreferences(ctx, u1, "25:99", true, false); !errors.Is(err, notify.ErrInvalidDigestTime) {
		t.Fatalf("expected ErrInvalidDigestTime, got %v", err)
	}

	updated, err := store.UpdatePreferences(ctx, u1, "09:15", true, true)
	if err != nil {
		t.Fatalf("UpdatePreferences: %v", err)
	}
	if updated.DigestTime != "09:15" || !updated.ExpirationEnabled || !updated.ShoppingListEnabled {
		t.Fatalf("unexpected updated preferences: %+v", updated)
	}

	// User 2 must remain unaffected
	p2, err := store.GetPreferences(ctx, u2)
	if err != nil {
		t.Fatalf("GetPreferences u2: %v", err)
	}
	if p2.DigestTime != notify.DefaultDigestTime || p2.ExpirationEnabled || p2.ShoppingListEnabled {
		t.Fatalf("user 2 preferences unexpectedly changed: %+v", p2)
	}
}

func TestTargetsUpsertIdempotencyAndUserScoping(t *testing.T) {
	conn, u1, u2 := openTestDB(t)
	store := notify.NewStore(conn)
	ctx := context.Background()

	cfg := notify.WebPushConfig{
		Endpoint: "https://push.example.com/sub/abc",
		P256DH:   "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
		Auth:     "tBHItJI5svbpez7KI4CCXg",
	}

	t1, err := store.UpsertWebPushTarget(ctx, u1, "iPhone", cfg)
	if err != nil {
		t.Fatalf("UpsertWebPushTarget 1: %v", err)
	}
	// Re-subscribing same endpoint updates idempotently
	cfg.Auth = "updatedAuthSecretValue"
	t1Again, err := store.UpsertWebPushTarget(ctx, u1, "iPhone 16", cfg)
	if err != nil {
		t.Fatalf("UpsertWebPushTarget 2: %v", err)
	}
	if t1.ID != t1Again.ID {
		t.Fatalf("expected idempotent upsert ID %d, got %d", t1.ID, t1Again.ID)
	}
	if t1Again.Label != "iPhone 16" {
		t.Fatalf("expected updated label, got %q", t1Again.Label)
	}

	// User 2 cannot delete User 1's target
	if err := store.DeleteTarget(ctx, u2, t1.ID); !errors.Is(err, notify.ErrTargetNotFound) {
		t.Fatalf("expected ErrTargetNotFound when deleting another user's target, got %v", err)
	}

	list, err := store.ListTargetSummaries(ctx, u1)
	if err != nil || len(list) != 1 {
		t.Fatalf("expected 1 target for u1, got %d (err=%v)", len(list), err)
	}

	if err := store.DeleteTarget(ctx, u1, t1.ID); err != nil {
		t.Fatalf("DeleteTarget own: %v", err)
	}
}

func TestWebPushChannelAndDispatcherPruning(t *testing.T) {
	conn, u1, _ := openTestDB(t)
	store := notify.NewStore(conn)
	ctx := context.Background()

	var mu sync.Mutex
	received := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		received++
		mu.Unlock()
		switch r.URL.Path {
		case "/ok":
			w.WriteHeader(http.StatusCreated)
		case "/gone":
			w.WriteHeader(http.StatusGone)
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
	}))
	t.Cleanup(ts.Close)

	// Valid P-256 uncompressed public key (65 bytes, 0x04 prefix) & 16-byte auth secret in base64url
	validP256DH := "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
	validAuth := "BTBZMqHH6r4Tts7J_aSIgg"

	_, err := store.UpsertWebPushTarget(ctx, u1, "Good Device", notify.WebPushConfig{
		Endpoint: ts.URL + "/ok",
		P256DH:   validP256DH,
		Auth:     validAuth,
	})
	if err != nil {
		t.Fatalf("upsert ok target: %v", err)
	}
	_, err = store.UpsertWebPushTarget(ctx, u1, "Gone Device", notify.WebPushConfig{
		Endpoint: ts.URL + "/gone",
		P256DH:   validP256DH,
		Auth:     validAuth,
	})
	if err != nil {
		t.Fatalf("upsert gone target: %v", err)
	}

	ch := notify.NewWebPushChannel(store)
	ch.HTTPClient = ts.Client()
	disp := notify.NewDispatcher(store, ch)

	res, err := disp.SendToUser(ctx, u1, notify.Message{
		Topic: notify.TopicTest,
		Title: "Test",
		Body:  "Hello",
		URL:   "/",
	})
	if err != nil {
		t.Fatalf("SendToUser: %v", err)
	}
	if res.Sent != 1 || res.Pruned != 1 || res.Failed != 0 {
		t.Fatalf("unexpected delivery result: %+v", res)
	}

	remaining, err := store.ListTargetSummaries(ctx, u1)
	if err != nil {
		t.Fatalf("ListTargetSummaries: %v", err)
	}
	if len(remaining) != 1 || remaining[0].Label != "Good Device" {
		t.Fatalf("expected only Good Device remaining, got %+v", remaining)
	}
	if remaining[0].LastUsedAt == nil {
		t.Fatalf("expected LastUsedAt to be recorded on Good Device")
	}
}

type mockChannel struct {
	mu   sync.Mutex
	sent []notify.Message
}

func (m *mockChannel) Type() string { return notify.ChannelWebPush }
func (m *mockChannel) Send(_ context.Context, _ notify.Target, msg notify.Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, msg)
	return nil
}
func (m *mockChannel) messages() []notify.Message {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]notify.Message, len(m.sent))
	copy(out, m.sent)
	return out
}

func seedDigestInventory(t *testing.T, conn *sql.DB, dueSoon bool, shopping bool) {
	t.Helper()
	now := db.NowUTC()
	resCat, err := conn.Exec(`INSERT INTO categories (name, created_at, updated_at) VALUES ('Pantry', ?, ?)`, now, now)
	if err != nil {
		t.Fatalf("insert category: %v", err)
	}
	catID, _ := resCat.LastInsertId()
	resLoc, err := conn.Exec(`INSERT INTO locations (name, created_at, updated_at) VALUES ('Fridge', ?, ?)`, now, now)
	if err != nil {
		t.Fatalf("insert location: %v", err)
	}
	locID, _ := resLoc.LastInsertId()

	if dueSoon {
		resProd, err := conn.Exec(`INSERT INTO products (name, category_id, default_location_id, created_at, updated_at) VALUES ('Milk', ?, ?, ?, ?)`, catID, locID, now, now)
		if err != nil {
			t.Fatalf("insert Milk: %v", err)
		}
		pid, _ := resProd.LastInsertId()
		if _, err := conn.Exec(`INSERT INTO items (product_id, location_id, due_on_date, created_at, updated_at) VALUES (?, ?, '2026-11-30', ?, ?)`, pid, locID, now, now); err != nil {
			t.Fatalf("insert Milk item: %v", err)
		}
	}
	if shopping {
		if _, err := conn.Exec(`INSERT INTO products (name, category_id, default_location_id, manually_added_to_shopping_list, created_at, updated_at) VALUES ('Eggs', ?, ?, 1, ?, ?)`, catID, locID, now, now); err != nil {
			t.Fatalf("insert Eggs: %v", err)
		}
	}
}

func TestSchedulerSeparateDigestsDeduplicationAndSkipping(t *testing.T) {
	conn, u1, u2 := openTestDB(t)
	seedDigestInventory(t, conn, true, true)

	store := notify.NewStore(conn)
	ctx := context.Background()

	// u1: both enabled + enrolled target
	if _, err := store.UpdatePreferences(ctx, u1, "08:30", true, true); err != nil {
		t.Fatalf("update prefs u1: %v", err)
	}
	if _, err := store.UpsertWebPushTarget(ctx, u1, "Phone", notify.WebPushConfig{
		Endpoint: "https://push.example.com/u1",
		P256DH:   "key",
		Auth:     "auth",
	}); err != nil {
		t.Fatalf("upsert u1: %v", err)
	}

	// u2: enabled but zero targets -> skipped
	if _, err := store.UpdatePreferences(ctx, u2, "08:30", true, true); err != nil {
		t.Fatalf("update prefs u2: %v", err)
	}

	mock := &mockChannel{}
	disp := notify.NewDispatcher(store, mock)

	// Before 08:30 -> nothing sent
	currentTime := time.Date(2026, 11, 28, 8, 29, 0, 0, time.UTC)
	sched := notify.NewScheduler(store, disp)
	sched.Now = func() time.Time { return currentTime }

	sched.RunOnce(ctx)
	if len(mock.messages()) != 0 {
		t.Fatalf("expected 0 messages before 08:30, got %d", len(mock.messages()))
	}

	// At 08:30 -> 2 separate notifications (expiration + shopping_list)
	currentTime = time.Date(2026, 11, 28, 8, 30, 0, 0, time.UTC)
	sched.RunOnce(ctx)
	msgs := mock.messages()
	if len(msgs) != 2 {
		t.Fatalf("expected 2 separate messages at 08:30, got %d: %+v", len(msgs), msgs)
	}
	if msgs[0].Topic != notify.TopicExpiration || msgs[0].URL != "/?status=due_soon" || !strings.Contains(msgs[0].Body, "Milk") {
		t.Fatalf("unexpected expiration message: %+v", msgs[0])
	}
	if msgs[1].Topic != notify.TopicShoppingList || msgs[1].URL != "/?status=shopping_list" || !strings.Contains(msgs[1].Body, "Eggs") {
		t.Fatalf("unexpected shopping list message: %+v", msgs[1])
	}

	// Re-running later the same day (simulating restart) -> deduplicated, no duplicates
	currentTime = time.Date(2026, 11, 28, 8, 45, 0, 0, time.UTC)
	sched.RunOnce(ctx)
	if len(mock.messages()) != 2 {
		t.Fatalf("expected no duplicate sends on same day, got %d total", len(mock.messages()))
	}

	// Outside grace window on next day (e.g. 12:00 when digest_time is 08:30) -> skipped
	currentTime = time.Date(2026, 11, 29, 12, 0, 0, 0, time.UTC)
	sched.RunOnce(ctx)
	if len(mock.messages()) != 2 {
		t.Fatalf("expected no sends outside grace window, got %d total", len(mock.messages()))
	}
}

func TestSchedulerSkipsEmptyDigest(t *testing.T) {
	conn, u1, _ := openTestDB(t)
	seedDigestInventory(t, conn, false, true) // only shopping list, no expiring items

	store := notify.NewStore(conn)
	ctx := context.Background()
	_, _ = store.UpdatePreferences(ctx, u1, "08:30", true, true)
	_, _ = store.UpsertWebPushTarget(ctx, u1, "Phone", notify.WebPushConfig{
		Endpoint: "https://push.example.com/u1",
		P256DH:   "key",
		Auth:     "auth",
	})

	mock := &mockChannel{}
	sched := notify.NewScheduler(store, notify.NewDispatcher(store, mock))
	sched.Now = func() time.Time { return time.Date(2026, 11, 28, 8, 30, 0, 0, time.UTC) }

	sched.RunOnce(ctx)
	msgs := mock.messages()
	if len(msgs) != 1 || msgs[0].Topic != notify.TopicShoppingList {
		t.Fatalf("expected only shopping_list digest when expiration is empty, got %+v", msgs)
	}
}
