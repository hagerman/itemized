package demo

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	"itemized/internal/db"
)

// Manager coordinates demo-mode seeding and periodic interval-aligned resets.
type Manager struct {
	db          *sql.DB
	interval    time.Duration
	nowFn       func() time.Time
	mu          sync.Mutex
	nextResetAt time.Time
	resetCount  int
}

// NewManager creates a demo Manager using the wall clock and immediately seeds the database.
func NewManager(conn *sql.DB, interval time.Duration) (*Manager, error) {
	return NewManagerWithClock(conn, interval, time.Now)
}

// NewManagerWithClock creates a demo Manager with a custom clock (useful for testing)
// and immediately resets and seeds the database.
func NewManagerWithClock(conn *sql.DB, interval time.Duration, nowFn func() time.Time) (*Manager, error) {
	if interval <= 0 {
		interval = DefaultResetInterval
	}
	if nowFn == nil {
		nowFn = time.Now
	}
	m := &Manager{
		db:       conn,
		interval: interval,
		nowFn:    nowFn,
	}
	if err := m.Reset(context.Background()); err != nil {
		return nil, err
	}
	return m, nil
}

// Interval returns the configured reset interval.
func (m *Manager) Interval() time.Duration {
	return m.interval
}

// NextResetAt returns the UTC timestamp of the next scheduled reset boundary.
func (m *Manager) NextResetAt() time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.nextResetAt
}

// EnsureFresh checks whether the current UTC time has reached or passed the
// scheduled reset boundary and resets the database if so.
func (m *Manager) EnsureFresh(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.nowFn().UTC().Before(m.nextResetAt) {
		return nil
	}
	return m.resetLocked(ctx)
}

// Reset unconditionally wipes all application tables and re-seeds the database
// inside a single transaction, then advances nextResetAt to the next interval boundary.
func (m *Manager) Reset(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.resetLocked(ctx)
}

func (m *Manager) resetLocked(ctx context.Context) error {
	now := m.nowFn().UTC()

	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("demo reset begin tx: %w", err)
	}
	defer tx.Rollback()

	// Delete in foreign-key-safe order.
	tables := []string{
		"product_merges",
		"items",
		"barcodes",
		"variants",
		"products",
		"locations",
		"categories",
		"printers",
		"label_templates",
		"settings",
		"sessions",
		"users",
	}
	for _, tbl := range tables {
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+tbl); err != nil {
			return fmt.Errorf("demo reset clear %s: %w", tbl, err)
		}
	}

	if err := Seed(ctx, tx, now); err != nil {
		return fmt.Errorf("demo reset seed: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("demo reset commit: %w", err)
	}

	if err := db.RebuildFTS(m.db); err != nil {
		return fmt.Errorf("demo reset rebuild fts: %w", err)
	}

	m.nextResetAt = alignNextReset(now, m.interval)
	m.resetCount++
	return nil
}

// Start runs a background goroutine that periodically calls EnsureFresh until ctx is cancelled.
func (m *Manager) Start(ctx context.Context) {
	tickInterval := 30 * time.Second
	if half := m.interval / 2; half > 0 && half < tickInterval {
		tickInterval = half
	}
	if tickInterval < 100*time.Millisecond {
		tickInterval = 100 * time.Millisecond
	}

	go func() {
		ticker := time.NewTicker(tickInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := m.EnsureFresh(ctx); err != nil && ctx.Err() == nil {
					log.Printf("demo background reset error: %v", err)
				}
			}
		}
	}()
}

func alignNextReset(now time.Time, interval time.Duration) time.Time {
	return now.UTC().Truncate(interval).Add(interval)
}
