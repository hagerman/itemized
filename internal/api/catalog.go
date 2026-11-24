package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"itemized/internal/db"
	"itemized/internal/domain"
	"itemized/internal/printer"
)

type Category struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	ParentID      *int64 `json:"parent_id"`
	HierarchyName string `json:"hierarchy_name,omitempty"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

type Location struct {
	ID            int64   `json:"id"`
	LegacyUUID    *string `json:"legacy_uuid,omitempty"`
	Name          string  `json:"name"`
	ParentID      *int64  `json:"parent_id"`
	IsFreezer     bool    `json:"is_freezer"`
	HierarchyName string  `json:"hierarchy_name,omitempty"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

type Barcode struct {
	ID              int64  `json:"id"`
	VariantID       int64  `json:"variant_id"`
	Barcode         string `json:"barcode"`
	DefaultQuantity int    `json:"default_quantity"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type Variant struct {
	ID          int64     `json:"id"`
	ProductID   int64     `json:"product_id"`
	Name        string    `json:"name"`
	VolumeValue *float64  `json:"volume_value"`
	VolumeUnit  *string   `json:"volume_unit"`
	WeightValue *float64  `json:"weight_value"`
	WeightUnit  *string   `json:"weight_unit"`
	LengthValue *float64  `json:"length_value"`
	LengthUnit  *string   `json:"length_unit"`
	Barcodes    []Barcode `json:"barcodes,omitempty"`
	CreatedAt   string    `json:"created_at"`
	UpdatedAt   string    `json:"updated_at"`
}

type Product struct {
	ID                          int64    `json:"id"`
	LegacyUUID                  *string  `json:"legacy_uuid,omitempty"`
	Name                        string   `json:"name"`
	CategoryID                  int64    `json:"category_id"`
	CategoryName                string   `json:"category_name,omitempty"`
	DefaultLocationID           int64    `json:"default_location_id"`
	DefaultLocationName         string   `json:"default_location_name,omitempty"`
	DefaultDueDays              *int     `json:"default_due_days"`
	CalculatedDueDays           *int     `json:"calculated_due_days"`
	DefaultDueDaysOnOpen        *int     `json:"default_due_days_on_open"`
	DefaultDueDaysOnFreeze      *int     `json:"default_due_days_on_freeze"`
	DefaultDueDaysOnThaw        *int     `json:"default_due_days_on_thaw"`
	UseAverageForDueDate        bool     `json:"use_average_for_due_date"`
	LabelPrintMode              string   `json:"label_print_mode"`
	MinimumValue                *int     `json:"minimum_value"`
	ManuallyAddedToShoppingList bool     `json:"manually_added_to_shopping_list"`
	VolumeValue                 *float64 `json:"volume_value"`
	VolumeUnit                  *string  `json:"volume_unit"`
	WeightValue                 *float64 `json:"weight_value"`
	WeightUnit                  *string  `json:"weight_unit"`
	LengthValue                 *float64 `json:"length_value"`
	LengthUnit                  *string  `json:"length_unit"`
	InStockCount                int      `json:"in_stock_count"`
	NextDueOnDate               *string  `json:"next_due_on_date"`
	NextLocationName            string   `json:"next_location_name,omitempty"`
	OnShoppingList              bool     `json:"on_shopping_list"`
	LowStock                    bool     `json:"low_stock"`
	LowStockAmount              *int     `json:"low_stock_amount"`
	DueSoon                     bool     `json:"due_soon"`
	Overdue                     bool     `json:"overdue"`
	CreatedAt                   string   `json:"created_at"`
	UpdatedAt                   string   `json:"updated_at"`
}

// --- Categories ---

func (s *Server) listAllCategories(ctx context.Context) ([]Category, map[int64]Category, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, name, parent_id, created_at, updated_at FROM categories ORDER BY name COLLATE NOCASE ASC`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var list []Category
	byID := make(map[int64]Category)
	for rows.Next() {
		var c Category
		var pid sql.NullInt64
		if err := rows.Scan(&c.ID, &c.Name, &pid, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, nil, err
		}
		if pid.Valid {
			v := pid.Int64
			c.ParentID = &v
		}
		list = append(list, c)
		byID[c.ID] = c
	}
	for i := range list {
		list[i].HierarchyName = buildCategoryPath(list[i].ID, byID)
		byID[list[i].ID] = list[i]
	}
	return list, byID, rows.Err()
}

func buildCategoryPath(id int64, byID map[int64]Category) string {
	var parts []string
	seen := map[int64]bool{}
	curr := id
	for !seen[curr] {
		seen[curr] = true
		c, ok := byID[curr]
		if !ok {
			break
		}
		parts = append([]string{c.Name}, parts...)
		if c.ParentID == nil {
			break
		}
		curr = *c.ParentID
	}
	return strings.Join(parts, " > ")
}

func collectDescendantCategoryIDs(rootID int64, list []Category) map[int64]bool {
	out := map[int64]bool{rootID: true}
	changed := true
	for changed {
		changed = false
		for _, c := range list {
			if c.ParentID != nil && out[*c.ParentID] && !out[c.ID] {
				out[c.ID] = true
				changed = true
			}
		}
	}
	return out
}

func (s *Server) handleListCategories(w http.ResponseWriter, r *http.Request) {
	cats, _, err := s.listAllCategories(r.Context())
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	if cats == nil {
		cats = []Category{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"categories": cats})
}

func (s *Server) handleCreateCategory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		ParentID *int64 `json:"parent_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		INSERT INTO categories (name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?)
	`, req.Name, req.ParentID, now, now)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	_, byID, _ := s.listAllCategories(r.Context())
	writeJSON(w, http.StatusCreated, map[string]any{"category": byID[id]})
}

func (s *Server) handleGetCategory(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	_, byID, err := s.listAllCategories(r.Context())
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	c, ok := byID[id]
	if !ok {
		writeError(w, http.StatusNotFound, "category not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"category": c})
}

func (s *Server) handleUpdateCategory(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name     string `json:"name"`
		ParentID *int64 `json:"parent_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ParentID != nil && *req.ParentID == id {
		writeError(w, http.StatusUnprocessableEntity, "category cannot be its own parent")
		return
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		UPDATE categories SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?
	`, strings.TrimSpace(req.Name), req.ParentID, now, id)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "category not found")
		return
	}
	_, byID, _ := s.listAllCategories(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"category": byID[id]})
}

func (s *Server) handleDeleteCategory(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	res, err := s.DB.ExecContext(r.Context(), `DELETE FROM categories WHERE id = ?`, id)
	if err != nil {
		writeError(w, http.StatusConflict, "category is in use by products")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "category not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Locations ---

func (s *Server) listAllLocations(ctx context.Context) ([]Location, map[int64]Location, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, legacy_uuid, name, parent_id, is_freezer, created_at, updated_at FROM locations ORDER BY name COLLATE NOCASE ASC`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var list []Location
	byID := make(map[int64]Location)
	for rows.Next() {
		var l Location
		var pid sql.NullInt64
		var lu sql.NullString
		var freezer int
		if err := rows.Scan(&l.ID, &lu, &l.Name, &pid, &freezer, &l.CreatedAt, &l.UpdatedAt); err != nil {
			return nil, nil, err
		}
		if pid.Valid {
			v := pid.Int64
			l.ParentID = &v
		}
		if lu.Valid {
			l.LegacyUUID = &lu.String
		}
		l.IsFreezer = freezer != 0
		list = append(list, l)
		byID[l.ID] = l
	}
	for i := range list {
		list[i].HierarchyName = buildLocationPath(list[i].ID, byID)
		byID[list[i].ID] = list[i]
	}
	return list, byID, rows.Err()
}

func buildLocationPath(id int64, byID map[int64]Location) string {
	var parts []string
	seen := map[int64]bool{}
	curr := id
	for !seen[curr] {
		seen[curr] = true
		l, ok := byID[curr]
		if !ok {
			break
		}
		parts = append([]string{l.Name}, parts...)
		if l.ParentID == nil {
			break
		}
		curr = *l.ParentID
	}
	return strings.Join(parts, " > ")
}

func collectDescendantLocationIDs(rootID int64, list []Location) map[int64]bool {
	out := map[int64]bool{rootID: true}
	changed := true
	for changed {
		changed = false
		for _, l := range list {
			if l.ParentID != nil && out[*l.ParentID] && !out[l.ID] {
				out[l.ID] = true
				changed = true
			}
		}
	}
	return out
}

func (s *Server) handleListLocations(w http.ResponseWriter, r *http.Request) {
	locs, _, err := s.listAllLocations(r.Context())
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	if q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))); q != "" {
		var filtered []Location
		for _, l := range locs {
			if strings.Contains(strings.ToLower(l.HierarchyName), q) {
				filtered = append(filtered, l)
			}
		}
		locs = filtered
	}
	if locs == nil {
		locs = []Location{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"locations": locs})
}

func (s *Server) handleCreateLocation(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string `json:"name"`
		ParentID  *int64 `json:"parent_id"`
		IsFreezer bool   `json:"is_freezer"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		INSERT INTO locations (name, parent_id, is_freezer, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
	`, req.Name, req.ParentID, boolToInt(req.IsFreezer), now, now)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	_, byID, _ := s.listAllLocations(r.Context())
	writeJSON(w, http.StatusCreated, map[string]any{"location": byID[id]})
}

func (s *Server) handleGetLocation(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	_, byID, err := s.listAllLocations(r.Context())
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	loc, ok := byID[id]
	if !ok {
		writeError(w, http.StatusNotFound, "location not found")
		return
	}
	items, err := s.listItemsByLocation(r.Context(), id)
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"location": loc, "items": items})
}

func (s *Server) handleUpdateLocation(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name      string `json:"name"`
		ParentID  *int64 `json:"parent_id"`
		IsFreezer bool   `json:"is_freezer"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ParentID != nil && *req.ParentID == id {
		writeError(w, http.StatusUnprocessableEntity, "location cannot be its own parent")
		return
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		UPDATE locations SET name = ?, parent_id = ?, is_freezer = ?, updated_at = ? WHERE id = ?
	`, strings.TrimSpace(req.Name), req.ParentID, boolToInt(req.IsFreezer), now, id)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "location not found")
		return
	}
	_, byID, _ := s.listAllLocations(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"location": byID[id]})
}

func (s *Server) handleDeleteLocation(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	res, err := s.DB.ExecContext(r.Context(), `DELETE FROM locations WHERE id = ?`, id)
	if err != nil {
		writeError(w, http.StatusConflict, "location is in use by products")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "location not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handlePrintLocationLabel(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	_, byID, err := s.listAllLocations(r.Context())
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	loc, ok := byID[id]
	if !ok {
		writeError(w, http.StatusNotFound, "location not found")
		return
	}
	parentName := ""
	if loc.ParentID != nil {
		if p, ok := byID[*loc.ParentID]; ok {
			parentName = p.HierarchyName
		}
	}
	payload := printer.LabelPayload{
		EntityType:         printer.EntityLocation,
		LocationID:         loc.ID,
		LocationName:       loc.Name,
		ParentLocationName: parentName,
		IsFreezer:          loc.IsFreezer,
		Barcode:            fmt.Sprintf("%s/go/l/%d", s.baseURL(r.Context(), r), loc.ID),
	}
	warnings := s.printToActivePrinters(r.Context(), printer.EntityLocation, payload)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "print_warnings": warnings})
}

// --- Products, Variants, Barcodes ---

type productInput struct {
	Name                        string   `json:"name"`
	CategoryID                  int64    `json:"category_id"`
	DefaultLocationID           int64    `json:"default_location_id"`
	DefaultDueDays              *int     `json:"default_due_days"`
	CalculatedDueDays           *int     `json:"calculated_due_days"`
	DefaultDueDaysOnOpen        *int     `json:"default_due_days_on_open"`
	DefaultDueDaysOnFreeze      *int     `json:"default_due_days_on_freeze"`
	DefaultDueDaysOnThaw        *int     `json:"default_due_days_on_thaw"`
	UseAverageForDueDate        bool     `json:"use_average_for_due_date"`
	LabelPrintMode              string   `json:"label_print_mode"`
	MinimumValue                *int     `json:"minimum_value"`
	ManuallyAddedToShoppingList bool     `json:"manually_added_to_shopping_list"`
	VolumeValue                 *float64 `json:"volume_value"`
	VolumeUnit                  *string  `json:"volume_unit"`
	WeightValue                 *float64 `json:"weight_value"`
	WeightUnit                  *string  `json:"weight_unit"`
	LengthValue                 *float64 `json:"length_value"`
	LengthUnit                  *string  `json:"length_unit"`
}

func (p *productInput) validate() error {
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" {
		return errors.New("name is required")
	}
	if p.CategoryID <= 0 {
		return errors.New("category_id is required")
	}
	if p.DefaultLocationID <= 0 {
		return errors.New("default_location_id is required")
	}
	if p.LabelPrintMode == "" {
		p.LabelPrintMode = "per_item"
	}
	if p.LabelPrintMode != "none" && p.LabelPrintMode != "single" && p.LabelPrintMode != "per_item" {
		return errors.New("invalid label_print_mode")
	}
	return domain.ValidateMeasurement(domain.Measurement{
		VolumeValue: p.VolumeValue, VolumeUnit: p.VolumeUnit,
		WeightValue: p.WeightValue, WeightUnit: p.WeightUnit,
		LengthValue: p.LengthValue, LengthUnit: p.LengthUnit,
	})
}

func (s *Server) loadProducts(ctx context.Context, searchQuery string) ([]Product, error) {
	_, catMap, err := s.listAllCategories(ctx)
	if err != nil {
		return nil, err
	}
	_, locMap, err := s.listAllLocations(ctx)
	if err != nil {
		return nil, err
	}

	var rows *sql.Rows
	q := strings.TrimSpace(searchQuery)
	if q != "" && len(q) >= 3 {
		ftsQuery := `"` + strings.ReplaceAll(q, `"`, `""`) + `"`
		rows, err = s.DB.QueryContext(ctx, `
			SELECT p.id, p.legacy_uuid, p.name, p.category_id, p.default_location_id,
			       p.default_due_days, p.default_due_days_on_open, p.default_due_days_on_freeze, p.default_due_days_on_thaw,
			       p.use_average_for_due_date, p.label_print_mode, p.minimum_value, p.manually_added_to_shopping_list,
			       p.volume_value, p.volume_unit, p.weight_value, p.weight_unit, p.length_value, p.length_unit,
			       p.created_at, p.updated_at
			FROM products p
			JOIN products_fts f ON f.rowid = p.id
			WHERE products_fts MATCH ?
			ORDER BY bm25(products_fts), p.name COLLATE NOCASE ASC
		`, ftsQuery)
	} else if q != "" {
		rows, err = s.DB.QueryContext(ctx, `
			SELECT p.id, p.legacy_uuid, p.name, p.category_id, p.default_location_id,
			       p.default_due_days, p.default_due_days_on_open, p.default_due_days_on_freeze, p.default_due_days_on_thaw,
			       p.use_average_for_due_date, p.label_print_mode, p.minimum_value, p.manually_added_to_shopping_list,
			       p.volume_value, p.volume_unit, p.weight_value, p.weight_unit, p.length_value, p.length_unit,
			       p.created_at, p.updated_at
			FROM products p
			WHERE p.name LIKE ? COLLATE NOCASE
			ORDER BY p.name COLLATE NOCASE ASC
		`, "%"+q+"%")
	} else {
		rows, err = s.DB.QueryContext(ctx, `
			SELECT p.id, p.legacy_uuid, p.name, p.category_id, p.default_location_id,
			       p.default_due_days, p.default_due_days_on_open, p.default_due_days_on_freeze, p.default_due_days_on_thaw,
			       p.use_average_for_due_date, p.label_print_mode, p.minimum_value, p.manually_added_to_shopping_list,
			       p.volume_value, p.volume_unit, p.weight_value, p.weight_unit, p.length_value, p.length_unit,
			       p.created_at, p.updated_at
			FROM products p
			ORDER BY p.name COLLATE NOCASE ASC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		if c, ok := catMap[p.CategoryID]; ok {
			p.CategoryName = c.HierarchyName
		}
		if l, ok := locMap[p.DefaultLocationID]; ok {
			p.DefaultLocationName = l.HierarchyName
		}
		products = append(products, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Aggregate unconsumed item stats per product (ordered so first row per product is the next-due item, tie-broken by first entered).
	type stockStat struct {
		count       int
		nextDue     *string
		nextLocName string
	}
	stats := make(map[int64]*stockStat)
	statRows, err := s.DB.QueryContext(ctx, `
		SELECT product_id, location_id, due_on_date
		FROM items
		WHERE consumed_on_date IS NULL
		ORDER BY
			product_id ASC,
			CASE WHEN due_on_date IS NULL OR due_on_date = '' THEN 1 ELSE 0 END ASC,
			due_on_date ASC,
			id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer statRows.Close()
	for statRows.Next() {
		var pid int64
		var locID sql.NullInt64
		var due sql.NullString
		if err := statRows.Scan(&pid, &locID, &due); err != nil {
			return nil, err
		}
		st, ok := stats[pid]
		if !ok {
			st = &stockStat{}
			if due.Valid && due.String != "" {
				v := due.String
				st.nextDue = &v
			}
			if locID.Valid {
				if l, exists := locMap[locID.Int64]; exists {
					st.nextLocName = l.HierarchyName
				}
			}
			stats[pid] = st
		}
		st.count++
	}
	if err := statRows.Err(); err != nil {
		return nil, err
	}

	today := todayUTC()
	for i := range products {
		p := &products[i]
		if st, ok := stats[p.ID]; ok {
			p.InStockCount = st.count
			p.NextDueOnDate = st.nextDue
			p.NextLocationName = st.nextLocName
		}
		p.LowStock = domain.IsLowStock(p.InStockCount, p.MinimumValue)
		p.LowStockAmount = domain.LowStockAmount(p.InStockCount, p.MinimumValue)
		p.OnShoppingList = domain.IsOnShoppingList(p.InStockCount, p.MinimumValue, p.ManuallyAddedToShoppingList)
		if p.NextDueOnDate != nil {
			if t, err := domain.ParseDate(*p.NextDueOnDate); err == nil && t != nil {
				p.DueSoon = domain.IsDueSoon(t, today, 7)
				p.Overdue = domain.IsOverdue(t, today)
			}
		}
		if p.UseAverageForDueDate {
			p.CalculatedDueDays = s.productRollingAverageDueDays(ctx, p.ID)
		}
	}
	return products, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanProduct(r rowScanner) (Product, error) {
	var p Product
	var lu, volU, wtU, lenU sql.NullString
	var defDue, openDue, frzDue, thawDue, minVal sql.NullInt64
	var volV, wtV, lenV sql.NullFloat64
	var useAvg, manShop int
	err := r.Scan(
		&p.ID, &lu, &p.Name, &p.CategoryID, &p.DefaultLocationID,
		&defDue, &openDue, &frzDue, &thawDue,
		&useAvg, &p.LabelPrintMode, &minVal, &manShop,
		&volV, &volU, &wtV, &wtU, &lenV, &lenU,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return p, err
	}
	if lu.Valid {
		p.LegacyUUID = &lu.String
	}
	p.DefaultDueDays = nullIntPtr(defDue)
	p.DefaultDueDaysOnOpen = nullIntPtr(openDue)
	p.DefaultDueDaysOnFreeze = nullIntPtr(frzDue)
	p.DefaultDueDaysOnThaw = nullIntPtr(thawDue)
	p.MinimumValue = nullIntPtr(minVal)
	p.UseAverageForDueDate = useAvg != 0
	p.ManuallyAddedToShoppingList = manShop != 0
	p.VolumeValue, p.VolumeUnit = nullFloatPtr(volV), nullStrPtr(volU)
	p.WeightValue, p.WeightUnit = nullFloatPtr(wtV), nullStrPtr(wtU)
	p.LengthValue, p.LengthUnit = nullFloatPtr(lenV), nullStrPtr(lenU)
	return p, nil
}

func (s *Server) handleListProducts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query().Get("q")
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "in_stock"
	}

	allProducts, err := s.loadProducts(ctx, q)
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}

	// Optional category / location hierarchy filters
	var allowedCats map[int64]bool
	if rawCat := r.URL.Query().Get("category_id"); rawCat != "" {
		if cid, err := strconv.ParseInt(rawCat, 10, 64); err == nil {
			cats, _, _ := s.listAllCategories(ctx)
			allowedCats = collectDescendantCategoryIDs(cid, cats)
		}
	}

	var allowedLocProducts map[int64]bool
	var allowedLocs map[int64]bool
	if rawLoc := r.URL.Query().Get("location_id"); rawLoc != "" {
		if lid, err := strconv.ParseInt(rawLoc, 10, 64); err == nil {
			locs, _, _ := s.listAllLocations(ctx)
			allowedLocs = collectDescendantLocationIDs(lid, locs)
			allowedLocProducts = make(map[int64]bool)
			rows, _ := s.DB.QueryContext(ctx, `SELECT DISTINCT product_id, location_id FROM items WHERE consumed_on_date IS NULL`)
			if rows != nil {
				for rows.Next() {
					var pid int64
					var ilid sql.NullInt64
					if rows.Scan(&pid, &ilid) == nil && ilid.Valid && allowedLocs[ilid.Int64] {
						allowedLocProducts[pid] = true
					}
				}
				rows.Close()
			}
		}
	}

	statusCounts := map[string]int{
		"in_stock":      0,
		"shopping_list": 0,
		"due_soon":      0,
		"overdue":       0,
		"all":           0,
	}

	var filtered []Product
	for _, p := range allProducts {
		if allowedCats != nil && !allowedCats[p.CategoryID] {
			continue
		}
		if allowedLocs != nil && !allowedLocs[p.DefaultLocationID] && !allowedLocProducts[p.ID] {
			continue
		}
		statusCounts["all"]++
		if p.InStockCount > 0 {
			statusCounts["in_stock"]++
		}
		if p.OnShoppingList {
			statusCounts["shopping_list"]++
		}
		if p.DueSoon {
			statusCounts["due_soon"]++
		}
		if p.Overdue {
			statusCounts["overdue"]++
		}

		match := false
		switch status {
		case "in_stock":
			match = p.InStockCount > 0
		case "shopping_list":
			match = p.OnShoppingList
		case "due_soon":
			match = p.DueSoon
		case "overdue":
			match = p.Overdue
		case "all":
			match = true
		default:
			match = p.InStockCount > 0
		}
		if match {
			filtered = append(filtered, p)
		}
	}

	switch r.URL.Query().Get("sort") {
	case "due_date":
		sort.SliceStable(filtered, func(i, j int) bool {
			a, b := filtered[i].NextDueOnDate, filtered[j].NextDueOnDate
			if a == nil && b == nil {
				return filtered[i].Name < filtered[j].Name
			}
			if a == nil {
				return false
			}
			if b == nil {
				return true
			}
			return *a < *b
		})
	case "stock":
		sort.SliceStable(filtered, func(i, j int) bool {
			return filtered[i].InStockCount > filtered[j].InStockCount
		})
	}

	if filtered == nil {
		filtered = []Product{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"products":      filtered,
		"status_counts": statusCounts,
	})
}

func (s *Server) getProductByID(ctx context.Context, id int64) (*Product, error) {
	all, err := s.loadProducts(ctx, "")
	if err != nil {
		return nil, err
	}
	for i := range all {
		if all[i].ID == id {
			return &all[i], nil
		}
	}
	return nil, sql.ErrNoRows
}

func (s *Server) listVariantsWithBarcodes(ctx context.Context, productID int64) ([]Variant, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, product_id, name, volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit, created_at, updated_at
		FROM variants WHERE product_id = ? ORDER BY id ASC
	`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Variant
	for rows.Next() {
		var v Variant
		var volV, wtV, lenV sql.NullFloat64
		var volU, wtU, lenU sql.NullString
		if err := rows.Scan(&v.ID, &v.ProductID, &v.Name, &volV, &volU, &wtV, &wtU, &lenV, &lenU, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		v.VolumeValue, v.VolumeUnit = nullFloatPtr(volV), nullStrPtr(volU)
		v.WeightValue, v.WeightUnit = nullFloatPtr(wtV), nullStrPtr(wtU)
		v.LengthValue, v.LengthUnit = nullFloatPtr(lenV), nullStrPtr(lenU)
		v.Barcodes = []Barcode{}
		list = append(list, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range list {
		bRows, err := s.DB.QueryContext(ctx, `
			SELECT id, variant_id, barcode, default_quantity, created_at, updated_at
			FROM barcodes WHERE variant_id = ? ORDER BY id ASC
		`, list[i].ID)
		if err != nil {
			return nil, err
		}
		for bRows.Next() {
			var b Barcode
			if err := bRows.Scan(&b.ID, &b.VariantID, &b.Barcode, &b.DefaultQuantity, &b.CreatedAt, &b.UpdatedAt); err != nil {
				bRows.Close()
				return nil, err
			}
			list[i].Barcodes = append(list[i].Barcodes, b)
		}
		if err := bRows.Err(); err != nil {
			bRows.Close()
			return nil, err
		}
		bRows.Close()
	}
	if list == nil {
		list = []Variant{}
	}
	return list, nil
}

func (s *Server) handleGetProduct(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := s.getProductByID(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	variants, err := s.listVariantsWithBarcodes(r.Context(), id)
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	items, err := s.listItemsByProduct(r.Context(), id, r.URL.Query().Get("include_consumed") == "true")
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"product":  p,
		"variants": variants,
		"items":    items,
	})
}

func (s *Server) handleCreateProduct(w http.ResponseWriter, r *http.Request) {
	var req productInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := req.validate(); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	id, err := s.insertProduct(r.Context(), s.DB, req)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	p, _ := s.getProductByID(r.Context(), id)
	writeJSON(w, http.StatusCreated, map[string]any{"product": p})
}

type sqlExecer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func (s *Server) insertProduct(ctx context.Context, exec sqlExecer, req productInput) (int64, error) {
	now := db.NowUTC()
	res, err := exec.ExecContext(ctx, `
		INSERT INTO products (
			name, category_id, default_location_id,
			default_due_days, default_due_days_on_open, default_due_days_on_freeze, default_due_days_on_thaw,
			use_average_for_due_date, label_print_mode, minimum_value, manually_added_to_shopping_list,
			volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, req.Name, req.CategoryID, req.DefaultLocationID,
		req.DefaultDueDays, req.DefaultDueDaysOnOpen, req.DefaultDueDaysOnFreeze, req.DefaultDueDaysOnThaw,
		boolToInt(req.UseAverageForDueDate), req.LabelPrintMode, req.MinimumValue, boolToInt(req.ManuallyAddedToShoppingList),
		req.VolumeValue, req.VolumeUnit, req.WeightValue, req.WeightUnit, req.LengthValue, req.LengthUnit,
		now, now)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Server) handleUpdateProduct(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req productInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := req.validate(); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		UPDATE products SET
			name = ?, category_id = ?, default_location_id = ?,
			default_due_days = ?, default_due_days_on_open = ?, default_due_days_on_freeze = ?, default_due_days_on_thaw = ?,
			use_average_for_due_date = ?, label_print_mode = ?, minimum_value = ?, manually_added_to_shopping_list = ?,
			volume_value = ?, volume_unit = ?, weight_value = ?, weight_unit = ?, length_value = ?, length_unit = ?,
			updated_at = ?
		WHERE id = ?
	`, req.Name, req.CategoryID, req.DefaultLocationID,
		req.DefaultDueDays, req.DefaultDueDaysOnOpen, req.DefaultDueDaysOnFreeze, req.DefaultDueDaysOnThaw,
		boolToInt(req.UseAverageForDueDate), req.LabelPrintMode, req.MinimumValue, boolToInt(req.ManuallyAddedToShoppingList),
		req.VolumeValue, req.VolumeUnit, req.WeightValue, req.WeightUnit, req.LengthValue, req.LengthUnit,
		now, id)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	p, _ := s.getProductByID(r.Context(), id)
	writeJSON(w, http.StatusOK, map[string]any{"product": p})
}

func (s *Server) handleDeleteProduct(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	res, err := s.DB.ExecContext(r.Context(), `DELETE FROM products WHERE id = ?`, id)
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleToggleShoppingList(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		UPDATE products
		SET manually_added_to_shopping_list = CASE WHEN manually_added_to_shopping_list = 0 THEN 1 ELSE 0 END,
		    updated_at = ?
		WHERE id = ?
	`, now, id)
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	p, _ := s.getProductByID(r.Context(), id)
	writeJSON(w, http.StatusOK, map[string]any{"product": p})
}

func (s *Server) handlePrintProductLabel(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := s.getProductByID(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	payload := printer.LabelPayload{
		EntityType:   printer.EntityProduct,
		ProductID:    p.ID,
		ProductName:  p.Name,
		CategoryName: p.CategoryName,
		LocationName: p.DefaultLocationName,
		Barcode:      fmt.Sprintf("%s/go/p/%d", s.baseURL(r.Context(), r), p.ID),
	}
	warnings := s.printToActivePrinters(r.Context(), printer.EntityProduct, payload)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "print_warnings": warnings})
}

func (s *Server) handleCreateVariant(w http.ResponseWriter, r *http.Request) {
	productID, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var req struct {
		Name        string   `json:"name"`
		VolumeValue *float64 `json:"volume_value"`
		VolumeUnit  *string  `json:"volume_unit"`
		WeightValue *float64 `json:"weight_value"`
		WeightUnit  *string  `json:"weight_unit"`
		LengthValue *float64 `json:"length_value"`
		LengthUnit  *string  `json:"length_unit"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	if err := domain.ValidateMeasurement(domain.Measurement{
		VolumeValue: req.VolumeValue, VolumeUnit: req.VolumeUnit,
		WeightValue: req.WeightValue, WeightUnit: req.WeightUnit,
		LengthValue: req.LengthValue, LengthUnit: req.LengthUnit,
	}); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		INSERT INTO variants (product_id, name, volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, productID, req.Name, req.VolumeValue, req.VolumeUnit, req.WeightValue, req.WeightUnit, req.LengthValue, req.LengthUnit, now, now)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	vid, _ := res.LastInsertId()
	writeJSON(w, http.StatusCreated, map[string]any{
		"variant": Variant{
			ID: vid, ProductID: productID, Name: req.Name,
			VolumeValue: req.VolumeValue, VolumeUnit: req.VolumeUnit,
			WeightValue: req.WeightValue, WeightUnit: req.WeightUnit,
			LengthValue: req.LengthValue, LengthUnit: req.LengthUnit,
			Barcodes: []Barcode{}, CreatedAt: now, UpdatedAt: now,
		},
	})
}

func (s *Server) handleUpdateVariant(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid variant id")
		return
	}
	var req struct {
		Name        string   `json:"name"`
		VolumeValue *float64 `json:"volume_value"`
		VolumeUnit  *string  `json:"volume_unit"`
		WeightValue *float64 `json:"weight_value"`
		WeightUnit  *string  `json:"weight_unit"`
		LengthValue *float64 `json:"length_value"`
		LengthUnit  *string  `json:"length_unit"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := domain.ValidateMeasurement(domain.Measurement{
		VolumeValue: req.VolumeValue, VolumeUnit: req.VolumeUnit,
		WeightValue: req.WeightValue, WeightUnit: req.WeightUnit,
		LengthValue: req.LengthValue, LengthUnit: req.LengthUnit,
	}); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		UPDATE variants SET name = ?, volume_value = ?, volume_unit = ?, weight_value = ?, weight_unit = ?, length_value = ?, length_unit = ?, updated_at = ?
		WHERE id = ?
	`, strings.TrimSpace(req.Name), req.VolumeValue, req.VolumeUnit, req.WeightValue, req.WeightUnit, req.LengthValue, req.LengthUnit, now, id)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "variant not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteVariant(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid variant id")
		return
	}
	res, err := s.DB.ExecContext(r.Context(), `DELETE FROM variants WHERE id = ?`, id)
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "variant not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleCreateBarcode(w http.ResponseWriter, r *http.Request) {
	variantID, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid variant id")
		return
	}
	var req struct {
		Barcode         string `json:"barcode"`
		DefaultQuantity int    `json:"default_quantity"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Barcode = strings.TrimSpace(req.Barcode)
	if req.Barcode == "" {
		writeError(w, http.StatusUnprocessableEntity, "barcode is required")
		return
	}
	if req.DefaultQuantity <= 0 {
		req.DefaultQuantity = 1
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		INSERT INTO barcodes (variant_id, barcode, default_quantity, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, variantID, req.Barcode, req.DefaultQuantity, now, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeError(w, http.StatusConflict, "barcode already exists")
			return
		}
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	writeJSON(w, http.StatusCreated, map[string]any{
		"barcode": Barcode{
			ID: id, VariantID: variantID, Barcode: req.Barcode, DefaultQuantity: req.DefaultQuantity,
			CreatedAt: now, UpdatedAt: now,
		},
	})
}

func (s *Server) handleDeleteBarcode(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid barcode id")
		return
	}
	res, err := s.DB.ExecContext(r.Context(), `DELETE FROM barcodes WHERE id = ?`, id)
	if err != nil {
		writeInternalError(w, "catalog internal error", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "barcode not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// --- Null helpers ---

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullIntPtr(n sql.NullInt64) *int {
	if !n.Valid {
		return nil
	}
	v := int(n.Int64)
	return &v
}

func nullInt64Ptr(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}

func nullFloatPtr(n sql.NullFloat64) *float64 {
	if !n.Valid {
		return nil
	}
	v := n.Float64
	return &v
}

func nullStrPtr(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	v := n.String
	return &v
}
