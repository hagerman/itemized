package db

import (
	"path/filepath"
	"testing"
)

func TestOpenMigrateAndIdempotency(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "itemized.db")

	conn, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer conn.Close()

	// Re-running Migrate must be idempotent.
	if err := Migrate(conn); err != nil {
		t.Fatalf("second Migrate failed: %v", err)
	}

	// Verify all 12 core tables exist.
	tables := []string{
		"users", "sessions", "settings", "categories", "locations",
		"products", "product_merges", "variants", "barcodes", "items", "printers", "label_templates",
	}
	for _, tbl := range tables {
		var name string
		err := conn.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, tbl).Scan(&name)
		if err != nil {
			t.Fatalf("expected table %q to exist: %v", tbl, err)
		}
	}

	// Verify WAL mode and foreign_keys are active.
	var fk int
	if err := conn.QueryRow(`PRAGMA foreign_keys`).Scan(&fk); err != nil || fk != 1 {
		t.Fatalf("expected foreign_keys=1, got %d (err=%v)", fk, err)
	}
	var jm string
	if err := conn.QueryRow(`PRAGMA journal_mode`).Scan(&jm); err != nil || jm != "wal" {
		t.Fatalf("expected journal_mode=wal, got %q (err=%v)", jm, err)
	}
}

func TestForeignKeysAndFTSTriggers(t *testing.T) {
	conn, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer conn.Close()

	now := NowUTC()

	// Foreign key enforcement: inserting a product with non-existent category must fail.
	if _, err := conn.Exec(`
		INSERT INTO products (name, category_id, default_location_id, created_at, updated_at)
		VALUES ('Orphan', 999, 999, ?, ?)
	`, now, now); err == nil {
		t.Fatalf("expected FK violation inserting product with missing category/location")
	}

	res, err := conn.Exec(`INSERT INTO categories (name, created_at, updated_at) VALUES ('Snacks', ?, ?)`, now, now)
	if err != nil {
		t.Fatalf("insert category: %v", err)
	}
	catID, _ := res.LastInsertId()

	res, err = conn.Exec(`INSERT INTO locations (name, legacy_uuid, is_freezer, created_at, updated_at) VALUES ('Pantry', '11111111-1111-1111-1111-111111111111', 0, ?, ?)`, now, now)
	if err != nil {
		t.Fatalf("insert location: %v", err)
	}
	locID, _ := res.LastInsertId()

	// Duplicate legacy_uuid must fail.
	if _, err := conn.Exec(`INSERT INTO locations (name, legacy_uuid, is_freezer, created_at, updated_at) VALUES ('Dup', '11111111-1111-1111-1111-111111111111', 0, ?, ?)`, now, now); err == nil {
		t.Fatalf("expected unique violation on duplicate legacy_uuid")
	}

	res, err = conn.Exec(`
		INSERT INTO products (name, category_id, default_location_id, created_at, updated_at)
		VALUES ('Nuts, Cashews, Whole', ?, ?, ?, ?)
	`, catID, locID, now, now)
	if err != nil {
		t.Fatalf("insert product: %v", err)
	}
	prodID, _ := res.LastInsertId()

	// FTS5 trigram substring search should match "cash".
	var foundID int64
	if err := conn.QueryRow(`SELECT rowid FROM products_fts WHERE products_fts MATCH '"cash"'`).Scan(&foundID); err != nil {
		t.Fatalf("expected FTS5 trigram match for 'cash': %v", err)
	}
	if foundID != prodID {
		t.Fatalf("expected rowid %d, got %d", prodID, foundID)
	}

	// Update trigger should re-index new name.
	if _, err := conn.Exec(`UPDATE products SET name = 'Nuts, Almonds, Roasted' WHERE id = ?`, prodID); err != nil {
		t.Fatalf("update product: %v", err)
	}
	var countOld int
	if err := conn.QueryRow(`SELECT COUNT(1) FROM products_fts WHERE products_fts MATCH '"cash"'`).Scan(&countOld); err != nil || countOld != 0 {
		t.Fatalf("expected old name 'cash' removed from FTS, got count=%d err=%v", countOld, err)
	}
	var countNew int
	if err := conn.QueryRow(`SELECT COUNT(1) FROM products_fts WHERE products_fts MATCH '"almo"'`).Scan(&countNew); err != nil || countNew != 1 {
		t.Fatalf("expected new name 'almo' indexed in FTS, got count=%d err=%v", countNew, err)
	}

	// Delete trigger should remove entry.
	if _, err := conn.Exec(`DELETE FROM products WHERE id = ?`, prodID); err != nil {
		t.Fatalf("delete product: %v", err)
	}
	if err := conn.QueryRow(`SELECT COUNT(1) FROM products_fts WHERE products_fts MATCH '"almo"'`).Scan(&countNew); err != nil || countNew != 0 {
		t.Fatalf("expected deleted product removed from FTS, got count=%d err=%v", countNew, err)
	}
}
