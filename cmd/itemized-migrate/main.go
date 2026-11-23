package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"itemized/internal/db"
	"itemized/internal/printer"
)

type LegacyCollection struct {
	ID      string
	Name    string
	OwnerID string
}

type LegacyUser struct {
	ID                  string
	Email               string
	PasswordDigest      string
	DueDateAverageCount int
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type LegacyCategory struct {
	ID        string
	Name      string
	ParentID  *string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type LegacyLocation struct {
	ID        string
	Name      string
	ParentID  *string
	IsFreezer bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type LegacyProduct struct {
	ID                          string
	Name                        string
	CategoryID                  string
	DefaultLocationID           string
	DefaultDueDays              *int
	DefaultDueDaysOnOpen        *int
	DefaultDueDaysOnFreeze      *int
	DefaultDueDaysOnThaw        *int
	UseAverageForDueDate        bool
	LabelPrintMode              string
	MinimumValue                *int
	ManuallyAddedToShoppingList bool
	VolumeValue                 *float64
	VolumeUnit                  *string
	WeightValue                 *float64
	WeightUnit                  *string
	LengthValue                 *float64
	LengthUnit                  *string
	CreatedAt                   time.Time
	UpdatedAt                   time.Time
}

type LegacyVariant struct {
	ID          string
	ProductID   string
	Name        string
	VolumeValue *float64
	VolumeUnit  *string
	WeightValue *float64
	WeightUnit  *string
	LengthValue *float64
	LengthUnit  *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type LegacyBarcode struct {
	ID              string
	VariantID       string
	Barcode         string
	DefaultQuantity int
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type LegacyItem struct {
	ID              string
	ProductID       string
	VariantID       *string
	LocationID      *string
	PurchasedOnDate *time.Time
	OpenedOnDate    *time.Time
	DueOnDate       *time.Time
	ConsumedOnDate  *time.Time
	Notes           *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type LegacyPrinter struct {
	ID           string
	Name         string
	Description  *string
	IPAddress    *string
	PrinterModel *string
	Status       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type LegacyReader interface {
	ListCollections(ctx context.Context) ([]LegacyCollection, error)
	ListUsersForCollection(ctx context.Context, collectionID, ownerID string) ([]LegacyUser, error)
	ListCategories(ctx context.Context, collectionID string) ([]LegacyCategory, error)
	ListLocations(ctx context.Context, collectionID string) ([]LegacyLocation, error)
	ListProducts(ctx context.Context, collectionID string) ([]LegacyProduct, error)
	ListVariants(ctx context.Context, collectionID string) ([]LegacyVariant, error)
	ListBarcodes(ctx context.Context, collectionID string) ([]LegacyBarcode, error)
	ListItems(ctx context.Context, collectionID string) ([]LegacyItem, error)
	ListPrinters(ctx context.Context, userIDs []string) ([]LegacyPrinter, error)
}

type MigrationReport struct {
	CollectionID   string
	CollectionName string
	Counts         map[string]int
}

func runMigration(ctx context.Context, reader LegacyReader, sqliteConn *sql.DB, collectionID string, out io.Writer) (*MigrationReport, error) {
	cols, err := reader.ListCollections(ctx)
	if err != nil {
		return nil, fmt.Errorf("list collections: %w", err)
	}
	if len(cols) == 0 {
		return nil, errors.New("no collections found in legacy database")
	}

	var selected *LegacyCollection
	if collectionID == "" {
		if len(cols) == 1 {
			selected = &cols[0]
		} else {
			var b strings.Builder
			b.WriteString("multiple collections found; specify --collection-id:\n")
			for _, c := range cols {
				fmt.Fprintf(&b, "  %s  %s\n", c.ID, c.Name)
			}
			return nil, errors.New(b.String())
		}
	} else {
		for i := range cols {
			if strings.EqualFold(cols[i].ID, collectionID) {
				selected = &cols[i]
				break
			}
		}
		if selected == nil {
			return nil, fmt.Errorf("collection %q not found", collectionID)
		}
	}

	users, err := reader.ListUsersForCollection(ctx, selected.ID, selected.OwnerID)
	if err != nil {
		return nil, fmt.Errorf("read users: %w", err)
	}
	categories, err := reader.ListCategories(ctx, selected.ID)
	if err != nil {
		return nil, fmt.Errorf("read categories: %w", err)
	}
	locations, err := reader.ListLocations(ctx, selected.ID)
	if err != nil {
		return nil, fmt.Errorf("read locations: %w", err)
	}
	products, err := reader.ListProducts(ctx, selected.ID)
	if err != nil {
		return nil, fmt.Errorf("read products: %w", err)
	}
	variants, err := reader.ListVariants(ctx, selected.ID)
	if err != nil {
		return nil, fmt.Errorf("read variants: %w", err)
	}
	barcodes, err := reader.ListBarcodes(ctx, selected.ID)
	if err != nil {
		return nil, fmt.Errorf("read barcodes: %w", err)
	}
	items, err := reader.ListItems(ctx, selected.ID)
	if err != nil {
		return nil, fmt.Errorf("read items: %w", err)
	}
	var userIDs []string
	for _, u := range users {
		userIDs = append(userIDs, u.ID)
	}
	printers, err := reader.ListPrinters(ctx, userIDs)
	if err != nil {
		return nil, fmt.Errorf("read printers: %w", err)
	}

	tx, err := sqliteConn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	counts := map[string]int{}

	// 1. Users + owner due_date_average_count setting
	for _, u := range users {
		role := "member"
		if strings.EqualFold(u.ID, selected.OwnerID) {
			role = "admin"
			if u.DueDateAverageCount > 0 {
				_, _ = tx.ExecContext(ctx, `
					INSERT INTO settings (key, value, updated_at) VALUES ('due_date_average_count', ?, ?)
					ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
				`, strconv.Itoa(u.DueDateAverageCount), ts(u.UpdatedAt))
			}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO users (email, password_hash, role, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`, strings.ToLower(strings.TrimSpace(u.Email)), u.PasswordDigest, role, ts(u.CreatedAt), ts(u.UpdatedAt)); err != nil {
			return nil, fmt.Errorf("insert user %s: %w", u.Email, err)
		}
		counts["users"]++
	}

	// 2. Categories (insert without parent first, then update parent_id so arbitrary tree order works)
	catMap := make(map[string]int64, len(categories))
	for _, c := range categories {
		res, err := tx.ExecContext(ctx, `
			INSERT INTO categories (name, created_at, updated_at) VALUES (?, ?, ?)
		`, c.Name, ts(c.CreatedAt), ts(c.UpdatedAt))
		if err != nil {
			return nil, fmt.Errorf("insert category %s: %w", c.ID, err)
		}
		id, _ := res.LastInsertId()
		catMap[strings.ToLower(c.ID)] = id
		counts["categories"]++
	}
	for _, c := range categories {
		if c.ParentID != nil {
			if pid, ok := catMap[strings.ToLower(*c.ParentID)]; ok {
				if _, err := tx.ExecContext(ctx, `UPDATE categories SET parent_id = ? WHERE id = ?`, pid, catMap[strings.ToLower(c.ID)]); err != nil {
					return nil, fmt.Errorf("update category parent %s: %w", c.ID, err)
				}
			}
		}
	}

	// 3. Locations (preserve legacy_uuid + two-pass parent_id)
	locMap := make(map[string]int64, len(locations))
	for _, l := range locations {
		lu := strings.ToLower(l.ID)
		res, err := tx.ExecContext(ctx, `
			INSERT INTO locations (legacy_uuid, name, is_freezer, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
		`, lu, l.Name, boolInt(l.IsFreezer), ts(l.CreatedAt), ts(l.UpdatedAt))
		if err != nil {
			return nil, fmt.Errorf("insert location %s: %w", l.ID, err)
		}
		id, _ := res.LastInsertId()
		locMap[lu] = id
		counts["locations"]++
	}
	for _, l := range locations {
		if l.ParentID != nil {
			if pid, ok := locMap[strings.ToLower(*l.ParentID)]; ok {
				if _, err := tx.ExecContext(ctx, `UPDATE locations SET parent_id = ? WHERE id = ?`, pid, locMap[strings.ToLower(l.ID)]); err != nil {
					return nil, fmt.Errorf("update location parent %s: %w", l.ID, err)
				}
			}
		}
	}

	// 4. Products (preserve legacy_uuid)
	prodMap := make(map[string]int64, len(products))
	for _, p := range products {
		lu := strings.ToLower(p.ID)
		cid, ok := catMap[strings.ToLower(p.CategoryID)]
		if !ok {
			return nil, fmt.Errorf("product %s references missing category %s", p.ID, p.CategoryID)
		}
		lid, ok := locMap[strings.ToLower(p.DefaultLocationID)]
		if !ok {
			return nil, fmt.Errorf("product %s references missing location %s", p.ID, p.DefaultLocationID)
		}
		mode := p.LabelPrintMode
		if mode != "none" && mode != "single" && mode != "per_item" {
			mode = "per_item"
		}
		res, err := tx.ExecContext(ctx, `
			INSERT INTO products (
				legacy_uuid, name, category_id, default_location_id,
				default_due_days, default_due_days_on_open, default_due_days_on_freeze, default_due_days_on_thaw,
				use_average_for_due_date, label_print_mode, minimum_value, manually_added_to_shopping_list,
				volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit,
				created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, lu, p.Name, cid, lid,
			p.DefaultDueDays, p.DefaultDueDaysOnOpen, p.DefaultDueDaysOnFreeze, p.DefaultDueDaysOnThaw,
			boolInt(p.UseAverageForDueDate), mode, p.MinimumValue, boolInt(p.ManuallyAddedToShoppingList),
			p.VolumeValue, p.VolumeUnit, p.WeightValue, p.WeightUnit, p.LengthValue, p.LengthUnit,
			ts(p.CreatedAt), ts(p.UpdatedAt))
		if err != nil {
			return nil, fmt.Errorf("insert product %s: %w", p.ID, err)
		}
		id, _ := res.LastInsertId()
		prodMap[lu] = id
		counts["products"]++
	}

	// 5. Variants
	varMap := make(map[string]int64, len(variants))
	for _, v := range variants {
		pid, ok := prodMap[strings.ToLower(v.ProductID)]
		if !ok {
			continue
		}
		res, err := tx.ExecContext(ctx, `
			INSERT INTO variants (product_id, name, volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, pid, v.Name, v.VolumeValue, v.VolumeUnit, v.WeightValue, v.WeightUnit, v.LengthValue, v.LengthUnit, ts(v.CreatedAt), ts(v.UpdatedAt))
		if err != nil {
			return nil, fmt.Errorf("insert variant %s: %w", v.ID, err)
		}
		id, _ := res.LastInsertId()
		varMap[strings.ToLower(v.ID)] = id
		counts["variants"]++
	}

	// 6. Barcodes
	for _, b := range barcodes {
		vid, ok := varMap[strings.ToLower(b.VariantID)]
		if !ok {
			continue
		}
		qty := b.DefaultQuantity
		if qty <= 0 {
			qty = 1
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO barcodes (variant_id, barcode, default_quantity, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`, vid, strings.TrimSpace(b.Barcode), qty, ts(b.CreatedAt), ts(b.UpdatedAt)); err != nil {
			return nil, fmt.Errorf("insert barcode %s: %w", b.Barcode, err)
		}
		counts["barcodes"]++
	}

	// 7. Items (preserve legacy_uuid)
	for _, it := range items {
		lu := strings.ToLower(it.ID)
		pid, ok := prodMap[strings.ToLower(it.ProductID)]
		if !ok {
			continue
		}
		var vid *int64
		if it.VariantID != nil {
			if mapped, ok := varMap[strings.ToLower(*it.VariantID)]; ok {
				vid = &mapped
			}
		}
		var lid *int64
		if it.LocationID != nil {
			if mapped, ok := locMap[strings.ToLower(*it.LocationID)]; ok {
				lid = &mapped
			}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO items (legacy_uuid, product_id, variant_id, location_id, purchased_on_date, opened_on_date, due_on_date, consumed_on_date, notes, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, lu, pid, vid, lid, dateStr(it.PurchasedOnDate), dateStr(it.OpenedOnDate), dateStr(it.DueOnDate), dateStr(it.ConsumedOnDate), it.Notes, ts(it.CreatedAt), ts(it.UpdatedAt)); err != nil {
			return nil, fmt.Errorf("insert item %s: %w", it.ID, err)
		}
		counts["items"]++
	}

	// 8. Printers
	for _, pr := range printers {
		endpoint := ""
		if pr.IPAddress != nil && strings.TrimSpace(*pr.IPAddress) != "" {
			ep := strings.TrimSpace(*pr.IPAddress)
			if !strings.HasPrefix(ep, "http://") && !strings.HasPrefix(ep, "https://") {
				ep = fmt.Sprintf("http://%s:631/ipp/print", ep)
			}
			endpoint = ep
		} else {
			endpoint = "http://localhost:631/ipp/print"
		}
		enabled := strings.EqualFold(pr.Status, "active")
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO printers (name, description, driver, endpoint, printer_model, enabled, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, pr.Name, pr.Description, printer.DriverIPPZPL, endpoint, pr.PrinterModel, boolInt(enabled), ts(pr.CreatedAt), ts(pr.UpdatedAt)); err != nil {
			return nil, fmt.Errorf("insert printer %s: %w", pr.Name, err)
		}
		counts["printers"]++
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit sqlite migration: %w", err)
	}

	// Rebuild FTS5 index and verify foreign keys.
	if err := db.RebuildFTS(sqliteConn); err != nil {
		return nil, fmt.Errorf("rebuild fts5: %w", err)
	}

	fkRows, err := sqliteConn.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return nil, fmt.Errorf("foreign_key_check: %w", err)
	}
	defer fkRows.Close()
	if fkRows.Next() {
		return nil, errors.New("PRAGMA foreign_key_check reported integrity violations")
	}

	report := &MigrationReport{
		CollectionID:   selected.ID,
		CollectionName: selected.Name,
		Counts:         counts,
	}
	if out != nil {
		fmt.Fprintf(out, "Migrated collection %q (%s)\n", report.CollectionName, report.CollectionID)
		for _, tbl := range []string{"users", "categories", "locations", "products", "variants", "barcodes", "items", "printers"} {
			fmt.Fprintf(out, "  %-12s %d rows\n", tbl, counts[tbl])
		}
		fmt.Fprintln(out, "FTS5 index rebuilt and PRAGMA foreign_key_check passed.")
	}
	return report, nil
}

func ts(t time.Time) string {
	if t.IsZero() {
		return db.NowUTC()
	}
	return t.UTC().Format(time.RFC3339)
}

func dateStr(t *time.Time) *string {
	if t == nil || t.IsZero() {
		return nil
	}
	s := t.Format("2006-01-02")
	return &s
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// --- Postgres implementation via pgx/v5 ---

type pgxReader struct {
	conn *pgx.Conn
}

func (r *pgxReader) ListCollections(ctx context.Context) ([]LegacyCollection, error) {
	rows, err := r.conn.Query(ctx, `SELECT id::text, COALESCE(name, ''), owner_id::text FROM collections ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyCollection
	for rows.Next() {
		var c LegacyCollection
		if err := rows.Scan(&c.ID, &c.Name, &c.OwnerID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *pgxReader) ListUsersForCollection(ctx context.Context, collectionID, ownerID string) ([]LegacyUser, error) {
	rows, err := r.conn.Query(ctx, `
		SELECT DISTINCT u.id::text, u.email_address, u.password_digest, u.due_date_average_count, u.created_at, u.updated_at
		FROM users u
		LEFT JOIN memberships m ON m.user_id = u.id AND m.collection_id::text = $1
		WHERE u.id::text = $2 OR m.id IS NOT NULL
		ORDER BY u.created_at ASC
	`, collectionID, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyUser
	for rows.Next() {
		var u LegacyUser
		if err := rows.Scan(&u.ID, &u.Email, &u.PasswordDigest, &u.DueDateAverageCount, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *pgxReader) ListCategories(ctx context.Context, collectionID string) ([]LegacyCategory, error) {
	rows, err := r.conn.Query(ctx, `SELECT id::text, COALESCE(name, ''), parent_id::text, created_at, updated_at FROM categories WHERE collection_id::text = $1`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyCategory
	for rows.Next() {
		var c LegacyCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.ParentID, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *pgxReader) ListLocations(ctx context.Context, collectionID string) ([]LegacyLocation, error) {
	rows, err := r.conn.Query(ctx, `SELECT id::text, COALESCE(name, ''), parent_id::text, COALESCE(is_freezer, false), created_at, updated_at FROM locations WHERE collection_id::text = $1`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyLocation
	for rows.Next() {
		var l LegacyLocation
		if err := rows.Scan(&l.ID, &l.Name, &l.ParentID, &l.IsFreezer, &l.CreatedAt, &l.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *pgxReader) ListProducts(ctx context.Context, collectionID string) ([]LegacyProduct, error) {
	rows, err := r.conn.Query(ctx, `
		SELECT id::text, COALESCE(name, ''), category_id::text, default_location_id::text,
		       default_due_days, default_due_days_on_open, default_due_days_on_freeze, default_due_days_on_thaw,
		       use_average_for_due_date, label_print_mode, minimum_value, manually_added_to_shopping_list,
		       volume_value::float8, volume_unit, weight_value::float8, weight_unit, length_value::float8, length_unit,
		       created_at, updated_at
		FROM products WHERE collection_id::text = $1
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyProduct
	for rows.Next() {
		var p LegacyProduct
		if err := rows.Scan(
			&p.ID, &p.Name, &p.CategoryID, &p.DefaultLocationID,
			&p.DefaultDueDays, &p.DefaultDueDaysOnOpen, &p.DefaultDueDaysOnFreeze, &p.DefaultDueDaysOnThaw,
			&p.UseAverageForDueDate, &p.LabelPrintMode, &p.MinimumValue, &p.ManuallyAddedToShoppingList,
			&p.VolumeValue, &p.VolumeUnit, &p.WeightValue, &p.WeightUnit, &p.LengthValue, &p.LengthUnit,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *pgxReader) ListVariants(ctx context.Context, collectionID string) ([]LegacyVariant, error) {
	rows, err := r.conn.Query(ctx, `
		SELECT v.id::text, v.product_id::text, v.name,
		       v.volume_value::float8, v.volume_unit, v.weight_value::float8, v.weight_unit, v.length_value::float8, v.length_unit,
		       v.created_at, v.updated_at
		FROM product_variants v
		JOIN products p ON p.id = v.product_id
		WHERE p.collection_id::text = $1
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyVariant
	for rows.Next() {
		var v LegacyVariant
		if err := rows.Scan(&v.ID, &v.ProductID, &v.Name, &v.VolumeValue, &v.VolumeUnit, &v.WeightValue, &v.WeightUnit, &v.LengthValue, &v.LengthUnit, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (r *pgxReader) ListBarcodes(ctx context.Context, collectionID string) ([]LegacyBarcode, error) {
	rows, err := r.conn.Query(ctx, `
		SELECT id::text, product_variant_id::text, barcode, default_quantity, created_at, updated_at
		FROM product_variant_barcodes WHERE collection_id::text = $1
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyBarcode
	for rows.Next() {
		var b LegacyBarcode
		if err := rows.Scan(&b.ID, &b.VariantID, &b.Barcode, &b.DefaultQuantity, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *pgxReader) ListItems(ctx context.Context, collectionID string) ([]LegacyItem, error) {
	rows, err := r.conn.Query(ctx, `
		SELECT i.id::text, i.product_id::text, i.product_variant_id::text, i.location_id::text,
		       i.purchased_on_date, i.opened_on_date, i.due_on_date, i.consumed_on_date, i.notes,
		       i.created_at, i.updated_at
		FROM product_items i
		JOIN products p ON p.id = i.product_id
		WHERE p.collection_id::text = $1
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyItem
	for rows.Next() {
		var it LegacyItem
		if err := rows.Scan(&it.ID, &it.ProductID, &it.VariantID, &it.LocationID, &it.PurchasedOnDate, &it.OpenedOnDate, &it.DueOnDate, &it.ConsumedOnDate, &it.Notes, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *pgxReader) ListPrinters(ctx context.Context, userIDs []string) ([]LegacyPrinter, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	rows, err := r.conn.Query(ctx, `
		SELECT id::text, COALESCE(name, ''), description, ip_address, printer_model, COALESCE(status, 'inactive'), created_at, updated_at
		FROM printers WHERE user_id::text = ANY($1)
	`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LegacyPrinter
	for rows.Next() {
		var p LegacyPrinter
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.IPAddress, &p.PrinterModel, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func main() {
	pgURL := flag.String("pg-url", "", "Legacy PostgreSQL connection URL (postgres://...)")
	sqlitePath := flag.String("sqlite", "", "Target SQLite database file path (e.g. /data/itemized.db)")
	collectionID := flag.String("collection-id", "", "Legacy collection UUID (optional if only one collection exists)")
	flag.Parse()

	if *pgURL == "" || *sqlitePath == "" {
		fmt.Fprintln(os.Stderr, "Usage: itemized-migrate --pg-url postgres://... --sqlite /data/itemized.db [--collection-id UUID]")
		os.Exit(2)
	}

	ctx := context.Background()
	pgConn, err := pgx.Connect(ctx, *pgURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect postgres: %v\n", err)
		os.Exit(1)
	}
	defer pgConn.Close(ctx)

	sqliteConn, err := db.Open(*sqlitePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open sqlite: %v\n", err)
		os.Exit(1)
	}
	defer sqliteConn.Close()

	if _, err := runMigration(ctx, &pgxReader{conn: pgConn}, sqliteConn, *collectionID, os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "migration failed: %v\n", err)
		os.Exit(1)
	}
}
