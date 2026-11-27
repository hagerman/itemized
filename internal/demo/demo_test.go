package demo

import (
	"context"
	"reflect"
	"sync"
	"testing"
	"time"

	"itemized/internal/db"
)

func TestSeedPopulatesExpectedStatesAndFTS(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	baseNow := time.Date(2026, 11, 25, 17, 20, 0, 0, time.UTC)
	mgr, err := NewManagerWithClock(conn, time.Hour, func() time.Time { return baseNow })
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}

	wantNext := time.Date(2026, 11, 25, 18, 0, 0, 0, time.UTC)
	if got := mgr.NextResetAt(); !got.Equal(wantNext) {
		t.Fatalf("NextResetAt = %v, want %v", got, wantNext)
	}

	// Verify demo admin and member users exist.
	var adminCount, memberCount int
	if err := conn.QueryRow(`SELECT COUNT(1) FROM users WHERE email = ? AND role = 'admin'`, DemoAdminEmail).Scan(&adminCount); err != nil || adminCount != 1 {
		t.Fatalf("expected 1 demo admin user, got %d (err=%v)", adminCount, err)
	}
	if err := conn.QueryRow(`SELECT COUNT(1) FROM users WHERE email = 'chris@itemizedapp.com' AND role = 'member'`).Scan(&memberCount); err != nil || memberCount != 1 {
		t.Fatalf("expected 1 demo member user chris@itemizedapp.com, got %d (err=%v)", memberCount, err)
	}

	// Verify hierarchical locations including freezers.
	var freezerCount, nestedLocCount int
	if err := conn.QueryRow(`SELECT COUNT(1) FROM locations WHERE is_freezer = 1`).Scan(&freezerCount); err != nil || freezerCount < 1 {
		t.Fatalf("expected >=1 freezer location, got %d (err=%v)", freezerCount, err)
	}
	if err := conn.QueryRow(`SELECT COUNT(1) FROM locations WHERE parent_id IS NOT NULL`).Scan(&nestedLocCount); err != nil || nestedLocCount < 3 {
		t.Fatalf("expected nested locations, got %d (err=%v)", nestedLocCount, err)
	}

	// Verify hierarchical categories.
	var nestedCatCount int
	if err := conn.QueryRow(`SELECT COUNT(1) FROM categories WHERE parent_id IS NOT NULL`).Scan(&nestedCatCount); err != nil || nestedCatCount < 3 {
		t.Fatalf("expected nested categories, got %d (err=%v)", nestedCatCount, err)
	}

	// Verify item states relative to 2026-11-25.
	todayStr := "2026-11-25"
	soonStr := "2026-11-30"
	var overdueCount, dueSoonCount, openedCount, consumedCount int
	_ = conn.QueryRow(`SELECT COUNT(1) FROM items WHERE consumed_on_date IS NULL AND due_on_date < ?`, todayStr).Scan(&overdueCount)
	_ = conn.QueryRow(`SELECT COUNT(1) FROM items WHERE consumed_on_date IS NULL AND due_on_date >= ? AND due_on_date <= ?`, todayStr, soonStr).Scan(&dueSoonCount)
	_ = conn.QueryRow(`SELECT COUNT(1) FROM items WHERE consumed_on_date IS NULL AND opened_on_date IS NOT NULL`).Scan(&openedCount)
	_ = conn.QueryRow(`SELECT COUNT(1) FROM items WHERE consumed_on_date IS NOT NULL`).Scan(&consumedCount)

	if overdueCount < 1 {
		t.Fatalf("expected >=1 overdue item, got %d", overdueCount)
	}
	if dueSoonCount < 1 {
		t.Fatalf("expected >=1 due-soon item, got %d", dueSoonCount)
	}
	if openedCount < 1 {
		t.Fatalf("expected >=1 opened item, got %d", openedCount)
	}
	if consumedCount < 3 {
		t.Fatalf("expected >=3 consumed items for rolling average, got %d", consumedCount)
	}

	// Verify shopping list coverage (both low-stock and manual) + barcodes + sample printer.
	var manualShopCount, lowStockEligibleCount, barcodeCount, printerCount int
	_ = conn.QueryRow(`SELECT COUNT(1) FROM products WHERE manually_added_to_shopping_list = 1`).Scan(&manualShopCount)
	_ = conn.QueryRow(`
		SELECT COUNT(1) FROM products p
		WHERE p.minimum_value IS NOT NULL
		  AND (SELECT COUNT(1) FROM items i WHERE i.product_id = p.id AND i.consumed_on_date IS NULL) < p.minimum_value
	`).Scan(&lowStockEligibleCount)
	_ = conn.QueryRow(`SELECT COUNT(1) FROM barcodes`).Scan(&barcodeCount)
	_ = conn.QueryRow(`SELECT COUNT(1) FROM printers WHERE name = 'Kitchen Zebra ZSB'`).Scan(&printerCount)

	if manualShopCount < 1 || lowStockEligibleCount < 1 {
		t.Fatalf("expected manual (%d) and low-stock (%d) shopping list items", manualShopCount, lowStockEligibleCount)
	}
	if barcodeCount < 3 {
		t.Fatalf("expected >=3 seeded barcodes, got %d", barcodeCount)
	}
	if printerCount < 1 {
		t.Fatalf("expected >=1 sample printer, got %d", printerCount)
	}

	// Verify seeded product names follow the standardized LLM naming convention.
	rows, err := conn.Query(`SELECT name FROM products ORDER BY name ASC`)
	if err != nil {
		t.Fatalf("query seeded products: %v", err)
	}
	defer rows.Close()
	var gotProducts []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan product name: %v", err)
		}
		gotProducts = append(gotProducts, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate seeded products: %v", err)
	}
	wantProducts := []string{
		"Beans, Black",
		"Beef, Ground",
		"Berries, Mixed",
		"Coffee, Whole Bean",
		"Milk, Whole",
		"Oil, Olive, Extra Virgin",
		"Paper Towels",
		"Pasta, Whole Grain",
		"Salsa, Fresh",
		"Soap, Dish",
		"Spinach, Baby",
		"Stock, Chicken",
		"Water, Sparkling",
		"Yogurt, Greek",
	}
	if !reflect.DeepEqual(gotProducts, wantProducts) {
		t.Fatalf("seeded product names = %v, want %v", gotProducts, wantProducts)
	}

	// Verify FTS5 trigram search matches seeded products.
	for _, query := range []string{`"pasta"`, `"olive"`, `"beans"`} {
		var ftsHits int
		if err := conn.QueryRow(`SELECT COUNT(1) FROM products_fts WHERE products_fts MATCH ?`, query).Scan(&ftsHits); err != nil || ftsHits < 1 {
			t.Fatalf("expected FTS5 hit for %s, got %d (err=%v)", query, ftsHits, err)
		}
	}
}

func TestManagerLazyResetAndConcurrency(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	var clockMu sync.Mutex
	cur := time.Date(2026, 11, 25, 17, 45, 0, 0, time.UTC)
	nowFn := func() time.Time {
		clockMu.Lock()
		defer clockMu.Unlock()
		return cur
	}

	mgr, err := NewManagerWithClock(conn, time.Hour, nowFn)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}
	if mgr.resetCount != 1 {
		t.Fatalf("expected initial resetCount=1, got %d", mgr.resetCount)
	}

	// Mutate database before reset boundary.
	if _, err := conn.Exec(`INSERT INTO categories (name, created_at, updated_at) VALUES ('Temporary Demo Cat', '2026-11-25T17:46:00Z', '2026-11-25T17:46:00Z')`); err != nil {
		t.Fatalf("insert temp category: %v", err)
	}

	// Still before 18:00 -> EnsureFresh should be a no-op.
	if err := mgr.EnsureFresh(context.Background()); err != nil {
		t.Fatalf("EnsureFresh before boundary: %v", err)
	}
	var tempCount int
	_ = conn.QueryRow(`SELECT COUNT(1) FROM categories WHERE name = 'Temporary Demo Cat'`).Scan(&tempCount)
	if tempCount != 1 || mgr.resetCount != 1 {
		t.Fatalf("expected mutation preserved before boundary (tempCount=%d, resetCount=%d)", tempCount, mgr.resetCount)
	}

	// Advance clock to 18:00:05 UTC and hit EnsureFresh concurrently.
	clockMu.Lock()
	cur = time.Date(2026, 11, 25, 18, 0, 5, 0, time.UTC)
	clockMu.Unlock()

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := mgr.EnsureFresh(context.Background()); err != nil {
				t.Errorf("concurrent EnsureFresh failed: %v", err)
			}
		}()
	}
	wg.Wait()

	if mgr.resetCount != 2 {
		t.Fatalf("expected exactly one reset across concurrent calls (resetCount=2), got %d", mgr.resetCount)
	}
	_ = conn.QueryRow(`SELECT COUNT(1) FROM categories WHERE name = 'Temporary Demo Cat'`).Scan(&tempCount)
	if tempCount != 0 {
		t.Fatalf("expected temporary category wiped after reset, got %d", tempCount)
	}
	wantNext := time.Date(2026, 11, 25, 19, 0, 0, 0, time.UTC)
	if got := mgr.NextResetAt(); !got.Equal(wantNext) {
		t.Fatalf("NextResetAt after rollover = %v, want %v", got, wantNext)
	}
}
