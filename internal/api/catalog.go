package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"itemized/internal/db"
	"itemized/internal/domain"
	"itemized/internal/llm"
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
	Barcodes    []Barcode `json:"barcodes"`
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
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	if req.ParentID != nil {
		if *req.ParentID == id {
			writeError(w, http.StatusUnprocessableEntity, "category cannot be its own parent")
			return
		}
		cats, _, err := s.listAllCategories(r.Context())
		if err != nil {
			writeInternalError(w, "catalog internal error", err)
			return
		}
		if collectDescendantCategoryIDs(id, cats)[*req.ParentID] {
			writeError(w, http.StatusUnprocessableEntity, "category cannot be moved under its own descendant")
			return
		}
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		UPDATE categories SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?
	`, req.Name, req.ParentID, now, id)
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
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	if req.ParentID != nil {
		if *req.ParentID == id {
			writeError(w, http.StatusUnprocessableEntity, "location cannot be its own parent")
			return
		}
		locs, _, err := s.listAllLocations(r.Context())
		if err != nil {
			writeInternalError(w, "catalog internal error", err)
			return
		}
		if collectDescendantLocationIDs(id, locs)[*req.ParentID] {
			writeError(w, http.StatusUnprocessableEntity, "location cannot be moved under its own descendant")
			return
		}
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		UPDATE locations SET name = ?, parent_id = ?, is_freezer = ?, updated_at = ? WHERE id = ?
	`, req.Name, req.ParentID, boolToInt(req.IsFreezer), now, id)
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

	const selectProductCols = `
			SELECT p.id, p.legacy_uuid, p.name, p.category_id, p.default_location_id,
			       p.default_due_days, p.default_due_days_on_open, p.default_due_days_on_freeze, p.default_due_days_on_thaw,
			       p.use_average_for_due_date, p.label_print_mode, p.minimum_value, p.manually_added_to_shopping_list,
			       p.volume_value, p.volume_unit, p.weight_value, p.weight_unit, p.length_value, p.length_unit,
			       p.created_at, p.updated_at
			FROM products p`

	q := strings.TrimSpace(searchQuery)
	var rows *sql.Rows
	var cleanQ string
	var keywords []string
	fuzzyFilter := false

	if q == "" {
		rows, err = s.DB.QueryContext(ctx, selectProductCols+` ORDER BY p.name COLLATE NOCASE ASC`)
	} else if domain.IsBarcodeQuery(q) {
		candidates := domain.BarcodeCandidates(q)
		placeholders := strings.TrimRight(strings.Repeat("?,", len(candidates)), ",")
		args := make([]any, len(candidates))
		for i, c := range candidates {
			args[i] = c
		}
		bcRows, bcErr := s.DB.QueryContext(ctx, `
			SELECT DISTINCT v.product_id
			FROM barcodes b
			JOIN variants v ON v.id = b.variant_id
			WHERE b.barcode IN (`+placeholders+`)
		`, args...)
		if bcErr != nil {
			return nil, bcErr
		}
		var matchedIDs []any
		for bcRows.Next() {
			var pid int64
			if scanErr := bcRows.Scan(&pid); scanErr != nil {
				bcRows.Close()
				return nil, scanErr
			}
			matchedIDs = append(matchedIDs, pid)
		}
		bcErr = bcRows.Err()
		bcRows.Close()
		if bcErr != nil {
			return nil, bcErr
		}
		if len(matchedIDs) > 0 {
			idPlaceholders := strings.TrimRight(strings.Repeat("?,", len(matchedIDs)), ",")
			rows, err = s.DB.QueryContext(ctx, selectProductCols+`
			WHERE p.id IN (`+idPlaceholders+`)
			ORDER BY p.name COLLATE NOCASE ASC`, matchedIDs...)
		} else {
			rows, err = s.DB.QueryContext(ctx, selectProductCols+`
			WHERE p.name LIKE ? COLLATE NOCASE
			ORDER BY p.name COLLATE NOCASE ASC`, "%"+q+"%")
		}
	} else {
		cleanQ = domain.NormalizeSearchQuery(q)
		if cleanQ == "" {
			return []Product{}, nil
		}
		keywords = domain.SearchKeywords(cleanQ)
		fuzzyFilter = true
		rows, err = s.DB.QueryContext(ctx, selectProductCols+` ORDER BY p.name COLLATE NOCASE ASC`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type scoredProduct struct {
		product Product
		match   domain.SearchMatch
	}
	var products []Product
	var scored []scoredProduct
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		if fuzzyFilter {
			m := domain.MatchProductSearch(p.Name, cleanQ, keywords)
			if !m.Matched {
				continue
			}
			if c, ok := catMap[p.CategoryID]; ok {
				p.CategoryName = c.HierarchyName
			}
			if l, ok := locMap[p.DefaultLocationID]; ok {
				p.DefaultLocationName = l.HierarchyName
			}
			scored = append(scored, scoredProduct{product: p, match: m})
			continue
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
	if fuzzyFilter {
		sort.SliceStable(scored, func(i, j int) bool {
			if scored[i].match.Tier != scored[j].match.Tier {
				return scored[i].match.Tier > scored[j].match.Tier
			}
			if scored[i].match.Similarity != scored[j].match.Similarity {
				return scored[i].match.Similarity > scored[j].match.Similarity
			}
			return strings.ToLower(scored[i].product.Name) < strings.ToLower(scored[j].product.Name)
		})
		products = make([]Product, len(scored))
		for i, sp := range scored {
			products[i] = sp.product
		}
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

	compareName := func(a, b Product) bool {
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	}
	switch r.URL.Query().Get("sort") {
	case "category":
		sort.SliceStable(filtered, func(i, j int) bool {
			a, b := strings.ToLower(filtered[i].CategoryName), strings.ToLower(filtered[j].CategoryName)
			if a == b {
				return compareName(filtered[i], filtered[j])
			}
			if a == "" {
				return false
			}
			if b == "" {
				return true
			}
			return a < b
		})
	case "location":
		sort.SliceStable(filtered, func(i, j int) bool {
			a, b := strings.ToLower(filtered[i].NextLocationName), strings.ToLower(filtered[j].NextLocationName)
			if a == b {
				return compareName(filtered[i], filtered[j])
			}
			if a == "" {
				return false
			}
			if b == "" {
				return true
			}
			return a < b
		})
	case "stock":
		sort.SliceStable(filtered, func(i, j int) bool {
			if filtered[i].InStockCount != filtered[j].InStockCount {
				return filtered[i].InStockCount > filtered[j].InStockCount
			}
			return compareName(filtered[i], filtered[j])
		})
	case "due_date":
		sort.SliceStable(filtered, func(i, j int) bool {
			a, b := filtered[i].NextDueOnDate, filtered[j].NextDueOnDate
			if a == nil && b == nil {
				return compareName(filtered[i], filtered[j])
			}
			if a == nil {
				return false
			}
			if b == nil {
				return true
			}
			if *a != *b {
				return *a < *b
			}
			return compareName(filtered[i], filtered[j])
		})
	case "shopping_list":
		sort.SliceStable(filtered, func(i, j int) bool {
			if filtered[i].OnShoppingList != filtered[j].OnShoppingList {
				return filtered[i].OnShoppingList
			}
			var aAmt, bAmt int
			if filtered[i].LowStockAmount != nil {
				aAmt = *filtered[i].LowStockAmount
			}
			if filtered[j].LowStockAmount != nil {
				bAmt = *filtered[j].LowStockAmount
			}
			if aAmt != bAmt {
				return aAmt > bAmt
			}
			return compareName(filtered[i], filtered[j])
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

func (s *Server) findProductByNormalizedName(ctx context.Context, exec sqlExecer, name string, excludeID int64) (int64, string, bool, error) {
	norm := strings.ToLower(strings.TrimSpace(name))
	if norm == "" {
		return 0, "", false, nil
	}
	var id int64
	var existingName string
	err := exec.QueryRowContext(ctx, `
		SELECT id, name FROM products
		WHERE LOWER(TRIM(name)) = ? AND id != ?
		ORDER BY id ASC
		LIMIT 1
	`, norm, excludeID).Scan(&id, &existingName)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", false, nil
	}
	if err != nil {
		return 0, "", false, err
	}
	return id, existingName, true, nil
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
	if existingID, existingName, found, err := s.findProductByNormalizedName(r.Context(), s.DB, req.Name, 0); err != nil {
		writeInternalError(w, "create product duplicate check", err)
		return
	} else if found {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": fmt.Sprintf("A product named %q already exists.", existingName),
			"existing_product": map[string]any{
				"id":   existingID,
				"name": existingName,
			},
		})
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
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func (s *Server) insertProduct(ctx context.Context, exec sqlExecer, req productInput) (int64, error) {
	var nextID int64
	if err := exec.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(id), 0) + 1 FROM (
			SELECT MAX(id) AS id FROM products
			UNION ALL
			SELECT MAX(source_product_id) AS id FROM product_merges
		)
	`).Scan(&nextID); err != nil {
		return 0, err
	}
	now := db.NowUTC()
	res, err := exec.ExecContext(ctx, `
		INSERT INTO products (
			id, name, category_id, default_location_id,
			default_due_days, default_due_days_on_open, default_due_days_on_freeze, default_due_days_on_thaw,
			use_average_for_due_date, label_print_mode, minimum_value, manually_added_to_shopping_list,
			volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, nextID, req.Name, req.CategoryID, req.DefaultLocationID,
		req.DefaultDueDays, req.DefaultDueDaysOnOpen, req.DefaultDueDaysOnFreeze, req.DefaultDueDaysOnThaw,
		boolToInt(req.UseAverageForDueDate), req.LabelPrintMode, req.MinimumValue, boolToInt(req.ManuallyAddedToShoppingList),
		req.VolumeValue, req.VolumeUnit, req.WeightValue, req.WeightUnit, req.LengthValue, req.LengthUnit,
		now, now)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Server) resolveProductIDByToken(ctx context.Context, token string) (int64, error) {
	var id int64
	if parsed, err := strconv.ParseInt(token, 10, 64); err == nil {
		if err := s.DB.QueryRowContext(ctx, `SELECT id FROM products WHERE id = ?`, parsed).Scan(&id); err == nil {
			return id, nil
		} else if !errors.Is(err, sql.ErrNoRows) {
			return 0, err
		}
		if err := s.DB.QueryRowContext(ctx, `SELECT target_product_id FROM product_merges WHERE source_product_id = ?`, parsed).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	lower := strings.ToLower(token)
	if err := s.DB.QueryRowContext(ctx, `SELECT id FROM products WHERE legacy_uuid = ?`, lower).Scan(&id); err == nil {
		return id, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	if err := s.DB.QueryRowContext(ctx, `SELECT target_product_id FROM product_merges WHERE source_legacy_uuid = ?`, lower).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

var (
	errMergeTargetNotFound = errors.New("target product not found")
	errMergeSourceNotFound = errors.New("one or more source products not found")
)

func (s *Server) mergeProductsTx(ctx context.Context, tx *sql.Tx, targetProductID int64, sourceIDs []int64, now string) (int, error) {
	if len(sourceIDs) == 0 {
		return 0, nil
	}
	var targetCheck int64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM products WHERE id = ?`, targetProductID).Scan(&targetCheck); errors.Is(err, sql.ErrNoRows) {
		return 0, errMergeTargetNotFound
	} else if err != nil {
		return 0, fmt.Errorf("check target: %w", err)
	}

	placeholders := strings.TrimRight(strings.Repeat("?,", len(sourceIDs)), ",")
	sourceArgs := make([]any, len(sourceIDs))
	for i, id := range sourceIDs {
		sourceArgs[i] = id
	}

	type sourceRecord struct {
		id         int64
		legacyUUID *string
	}
	rows, err := tx.QueryContext(ctx, `SELECT id, legacy_uuid FROM products WHERE id IN (`+placeholders+`)`, sourceArgs...)
	if err != nil {
		return 0, fmt.Errorf("load sources: %w", err)
	}
	var sources []sourceRecord
	for rows.Next() {
		var sr sourceRecord
		var lu sql.NullString
		if err := rows.Scan(&sr.id, &lu); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan source: %w", err)
		}
		if lu.Valid && strings.TrimSpace(lu.String) != "" {
			v := strings.ToLower(strings.TrimSpace(lu.String))
			sr.legacyUUID = &v
		}
		sources = append(sources, sr)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, fmt.Errorf("iterate sources: %w", err)
	}
	rows.Close()

	if len(sources) != len(sourceIDs) {
		return 0, errMergeSourceNotFound
	}

	updateArgs := append([]any{targetProductID, now}, sourceArgs...)
	if _, err := tx.ExecContext(ctx, `UPDATE variants SET product_id = ?, updated_at = ? WHERE product_id IN (`+placeholders+`)`, updateArgs...); err != nil {
		return 0, fmt.Errorf("move variants: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE items SET product_id = ?, updated_at = ? WHERE product_id IN (`+placeholders+`)`, updateArgs...); err != nil {
		return 0, fmt.Errorf("move items: %w", err)
	}

	repointArgs := append([]any{targetProductID}, sourceArgs...)
	if _, err := tx.ExecContext(ctx, `UPDATE product_merges SET target_product_id = ? WHERE target_product_id IN (`+placeholders+`)`, repointArgs...); err != nil {
		return 0, fmt.Errorf("repoint aliases: %w", err)
	}

	for _, sr := range sources {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO product_merges (source_product_id, source_legacy_uuid, target_product_id, merged_at)
			VALUES (?, ?, ?, ?)
		`, sr.id, sr.legacyUUID, targetProductID, now); err != nil {
			return 0, fmt.Errorf("insert alias: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM products WHERE id IN (`+placeholders+`)`, sourceArgs...); err != nil {
		return 0, fmt.Errorf("delete sources: %w", err)
	}

	return len(sources), nil
}

func (s *Server) handleMergeProducts(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TargetProductID  int64   `json:"target_product_id"`
		SourceProductIDs []int64 `json:"source_product_ids"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.TargetProductID <= 0 {
		writeError(w, http.StatusUnprocessableEntity, "target_product_id is required")
		return
	}

	seen := make(map[int64]bool, len(req.SourceProductIDs))
	sourceIDs := make([]int64, 0, len(req.SourceProductIDs))
	for _, id := range req.SourceProductIDs {
		if id <= 0 {
			writeError(w, http.StatusUnprocessableEntity, "source_product_ids must contain positive integers")
			return
		}
		if id == req.TargetProductID {
			writeError(w, http.StatusUnprocessableEntity, "target product cannot be included in source_product_ids")
			return
		}
		if !seen[id] {
			seen[id] = true
			sourceIDs = append(sourceIDs, id)
		}
	}
	if len(sourceIDs) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "at least one source product is required")
		return
	}

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeInternalError(w, "merge products begin tx", err)
		return
	}
	defer tx.Rollback()

	mergedCount, err := s.mergeProductsTx(ctx, tx, req.TargetProductID, sourceIDs, db.NowUTC())
	if errors.Is(err, errMergeTargetNotFound) {
		writeError(w, http.StatusNotFound, "target product not found")
		return
	}
	if errors.Is(err, errMergeSourceNotFound) {
		writeError(w, http.StatusNotFound, "one or more source products not found")
		return
	}
	if err != nil {
		writeInternalError(w, "merge products tx", err)
		return
	}

	if err := tx.Commit(); err != nil {
		writeInternalError(w, "merge products commit", err)
		return
	}

	p, err := s.getProductByID(ctx, req.TargetProductID)
	if err != nil {
		writeInternalError(w, "merge products load target", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"product":      p,
		"merged_count": mergedCount,
	})
}

var broadTaxonomyPrefixes = map[string]bool{
	"meat":           true,
	"produce":        true,
	"bakery":         true,
	"baked goods":    true,
	"beverage":       true,
	"beverages":      true,
	"snack":          true,
	"snacks":         true,
	"prepared foods": true,
	"prepared meals": true,
	"groceries":      true,
	"household":      true,
	"miscellaneous":  true,
	"frozen foods":   true,
	"canned goods":   true,
	"dairy":          true,
	"condiments":     true,
}

func leadingCommaPrefix(s string) string {
	if idx := strings.Index(s, ","); idx > 0 {
		return strings.ToLower(strings.TrimSpace(s[:idx]))
	}
	return ""
}

func prefixMatches(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	return a == b || a+"s" == b || b+"s" == a || a+"es" == b || b+"es" == a
}

func (s *Server) loadCatalogNamingContext(ctx context.Context, queries []string, excludeIDs map[int64]bool) ([]llm.ProductCandidate, []string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, name FROM products ORDER BY id ASC`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var all []llm.ProductCandidate
	prefixCounts := make(map[string]int)
	prefixDisplay := make(map[string]string)

	for rows.Next() {
		var p llm.ProductCandidate
		if err := rows.Scan(&p.ID, &p.Name); err != nil {
			return nil, nil, err
		}
		all = append(all, p)
		if idx := strings.Index(p.Name, ","); idx > 0 {
			rawPrefix := strings.TrimSpace(p.Name[:idx])
			lowerPrefix := strings.ToLower(rawPrefix)
			if rawPrefix != "" && !broadTaxonomyPrefixes[lowerPrefix] {
				prefixCounts[lowerPrefix]++
				if _, exists := prefixDisplay[lowerPrefix]; !exists {
					prefixDisplay[lowerPrefix] = rawPrefix
				}
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// Prepare normalized query sets and extract any leading prefixes from queries.
	type parsedQuery struct {
		clean         string
		leadingPrefix string
		keywords      []string
		wordSet       map[string]bool
	}
	var pQueries []parsedQuery
	var queryLeadingPrefixes []string
	for _, q := range queries {
		lp := leadingCommaPrefix(q)
		if lp != "" && !broadTaxonomyPrefixes[lp] {
			queryLeadingPrefixes = append(queryLeadingPrefixes, lp)
		}
		clean := domain.NormalizeSearchQuery(q)
		kws := domain.SearchKeywords(clean)
		if len(kws) == 0 {
			continue
		}
		ws := make(map[string]bool, len(kws))
		for _, w := range kws {
			ws[w] = true
		}
		pQueries = append(pQueries, parsedQuery{
			clean:         clean,
			leadingPrefix: lp,
			keywords:      kws,
			wordSet:       ws,
		})
	}

	type prefixEntry struct {
		lower   string
		display string
		count   int
	}
	var pEntries []prefixEntry
	for k, cnt := range prefixCounts {
		pEntries = append(pEntries, prefixEntry{lower: k, display: prefixDisplay[k], count: cnt})
	}
	sort.Slice(pEntries, func(i, j int) bool {
		if pEntries[i].count != pEntries[j].count {
			return pEntries[i].count > pEntries[j].count
		}
		return pEntries[i].display < pEntries[j].display
	})

	// Guarantee inclusion of any existing non-department catalog prefix matching a query's leading prefix,
	// even if it falls outside the global top 30.
	prefixes := make([]string, 0, 35)
	addedPrefix := make(map[string]bool)
	for _, qlp := range queryLeadingPrefixes {
		for _, entry := range pEntries {
			if !addedPrefix[entry.lower] && prefixMatches(qlp, entry.lower) {
				addedPrefix[entry.lower] = true
				prefixes = append(prefixes, entry.display)
			}
		}
	}
	for _, entry := range pEntries {
		if len(prefixes) >= 30 {
			break
		}
		if !addedPrefix[entry.lower] {
			addedPrefix[entry.lower] = true
			prefixes = append(prefixes, entry.display)
		}
	}

	if len(pQueries) == 0 {
		return nil, prefixes, nil
	}

	type scoredCandidate struct {
		cand  llm.ProductCandidate
		score float64
	}
	var scored []scoredCandidate
	for _, prod := range all {
		if excludeIDs != nil && excludeIDs[prod.ID] {
			continue
		}
		bestScore := 0.0
		prodClean := domain.NormalizeSearchQuery(prod.Name)
		prodWords := domain.SearchKeywords(prodClean)
		prodPrefix := leadingCommaPrefix(prod.Name)
		for _, pq := range pQueries {
			leadingBonus := 0.0
			if prefixMatches(prodPrefix, pq.leadingPrefix) {
				leadingBonus = 35.0
			}
			if m := domain.MatchProductSearch(prod.Name, pq.clean, pq.keywords); m.Matched {
				s := float64(m.Tier)*10.0 + m.Similarity + leadingBonus
				if s > bestScore {
					bestScore = s
				}
			}
			// Token containment: handles brand-heavy UPC titles like "Burman's Dijon Mustard"
			// matching generic "Mustard, Dijon" where all product words appear in the title.
			if len(prodWords) > 0 {
				hits := 0
				for _, pw := range prodWords {
					if len([]rune(pw)) < 3 {
						continue
					}
					if pq.wordSet[pw] {
						hits++
						continue
					}
					// Also match simple plural/singular suffix or substring
					for qw := range pq.wordSet {
						if len([]rune(qw)) >= 3 && (strings.HasPrefix(qw, pw) || strings.HasPrefix(pw, qw)) {
							hits++
							break
						}
					}
				}
				if hits > 0 {
					coverage := float64(hits) / float64(len(prodWords))
					tokenScore := coverage*25.0 + float64(hits)*2.0 + leadingBonus
					if tokenScore > bestScore {
						bestScore = tokenScore
					}
				}
			} else if leadingBonus > bestScore {
				bestScore = leadingBonus
			}
		}
		if bestScore > 0 {
			scored = append(scored, scoredCandidate{cand: prod, score: bestScore})
		}
	}

	sort.Slice(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		return scored[i].cand.Name < scored[j].cand.Name
	})
	maxCandidates := 20
	if len(scored) < maxCandidates {
		maxCandidates = len(scored)
	}
	candidates := make([]llm.ProductCandidate, 0, maxCandidates)
	for i := 0; i < maxCandidates; i++ {
		candidates = append(candidates, scored[i].cand)
	}
	return candidates, prefixes, nil
}

func (s *Server) handleReclassifySuggest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductIDs []int64 `json:"product_ids"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	cfg := s.llmConfig(r.Context())
	if !cfg.Enabled() {
		writeError(w, http.StatusBadRequest, "llm classification is not configured")
		return
	}

	seen := make(map[int64]bool, len(req.ProductIDs))
	ids := make([]int64, 0, len(req.ProductIDs))
	for _, id := range req.ProductIDs {
		if id <= 0 {
			writeError(w, http.StatusUnprocessableEntity, "product_ids must contain positive integers")
			return
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "at least one product_id is required")
		return
	}
	if len(ids) > 100 {
		writeError(w, http.StatusUnprocessableEntity, "at most 100 products may be reclassified per request")
		return
	}

	ctx := r.Context()
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}

	rows, err := s.DB.QueryContext(ctx, `SELECT id, name, category_id FROM products WHERE id IN (`+placeholders+`)`, args...)
	if err != nil {
		writeInternalError(w, "reclassify suggest load products", err)
		return
	}
	nameByID := make(map[int64]string, len(ids))
	catIDByProd := make(map[int64]int64, len(ids))
	for rows.Next() {
		var id int64
		var name string
		var catID int64
		if err := rows.Scan(&id, &name, &catID); err != nil {
			rows.Close()
			writeInternalError(w, "reclassify suggest scan product", err)
			return
		}
		nameByID[id] = name
		catIDByProd[id] = catID
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeInternalError(w, "reclassify suggest iterate products", err)
		return
	}
	rows.Close()

	if len(nameByID) != len(ids) {
		writeError(w, http.StatusNotFound, "one or more products not found")
		return
	}

	_, catMap, err := s.listAllCategories(ctx)
	if err != nil {
		writeInternalError(w, "reclassify suggest load categories", err)
		return
	}

	vRows, err := s.DB.QueryContext(ctx, `SELECT product_id, name FROM variants WHERE product_id IN (`+placeholders+`) ORDER BY id ASC`, args...)
	if err != nil {
		writeInternalError(w, "reclassify suggest load variants", err)
		return
	}
	variantsByProd := make(map[int64][]string)
	for vRows.Next() {
		var pid int64
		var vName string
		if err := vRows.Scan(&pid, &vName); err != nil {
			vRows.Close()
			writeInternalError(w, "reclassify suggest scan variant", err)
			return
		}
		vName = strings.TrimSpace(vName)
		if vName != "" &&
			!strings.EqualFold(vName, "default") &&
			!strings.EqualFold(vName, "default variant") &&
			!strings.EqualFold(vName, strings.TrimSpace(nameByID[pid])) {
			variantsByProd[pid] = append(variantsByProd[pid], vName)
		}
	}
	if err := vRows.Err(); err != nil {
		vRows.Close()
		writeInternalError(w, "reclassify suggest iterate variants", err)
		return
	}
	vRows.Close()

	inputs := make([]llm.ReclassifyInput, 0, len(ids))
	queries := make([]string, 0, len(ids)*2)
	for _, id := range ids {
		name := nameByID[id]
		vNames := variantsByProd[id]
		catName := ""
		if c, ok := catMap[catIDByProd[id]]; ok {
			catName = c.HierarchyName
		}
		inputs = append(inputs, llm.ReclassifyInput{
			ProductID:    id,
			CurrentName:  name,
			CategoryName: catName,
			VariantNames: vNames,
		})
		queries = append(queries, name)
		queries = append(queries, vNames...)
	}

	candidates, prefixes, err := s.loadCatalogNamingContext(ctx, queries, seen)
	if err != nil {
		writeInternalError(w, "reclassify suggest catalog context", err)
		return
	}

	suggestions, err := s.LLM.ReclassifyNames(ctx, cfg, inputs, candidates, prefixes)
	if err != nil {
		log.Printf("reclassify suggest warning (provider=%s model=%s): %v", cfg.Provider, cfg.Model, err)
		writeError(w, http.StatusBadGateway, "classification unavailable")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"suggestions": suggestions,
	})
}

func (s *Server) handleReclassifyApply(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Items []struct {
			ProductID int64  `json:"product_id"`
			NewName   string `json:"new_name"`
		} `json:"items"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "at least one item is required")
		return
	}

	type applyItem struct {
		productID int64
		newName   string
		normName  string
	}
	seenIDs := make(map[int64]bool, len(req.Items))
	items := make([]applyItem, 0, len(req.Items))
	for _, it := range req.Items {
		if it.ProductID <= 0 {
			writeError(w, http.StatusUnprocessableEntity, "product_id must be a positive integer")
			return
		}
		if seenIDs[it.ProductID] {
			writeError(w, http.StatusUnprocessableEntity, "duplicate product_id in items")
			return
		}
		trimmed := strings.TrimSpace(it.NewName)
		if trimmed == "" {
			writeError(w, http.StatusUnprocessableEntity, "new_name is required for every item")
			return
		}
		seenIDs[it.ProductID] = true
		items = append(items, applyItem{
			productID: it.ProductID,
			newName:   trimmed,
			normName:  strings.ToLower(trimmed),
		})
	}

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeInternalError(w, "reclassify apply begin tx", err)
		return
	}
	defer tx.Rollback()

	// Load stats for all submitted products to validate existence and pick deterministic survivors.
	type prodStats struct {
		id           int64
		currentName  string
		inStockCount int
		variantCount int
	}
	statsByID := make(map[int64]prodStats, len(items))
	for _, it := range items {
		var st prodStats
		err := tx.QueryRowContext(ctx, `
			SELECT p.id, p.name,
				(SELECT COUNT(*) FROM items i WHERE i.product_id = p.id AND i.consumed_on_date IS NULL),
				(SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id)
			FROM products p
			WHERE p.id = ?
		`, it.productID).Scan(&st.id, &st.currentName, &st.inStockCount, &st.variantCount)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "one or more products not found")
			return
		}
		if err != nil {
			writeInternalError(w, "reclassify apply load product stats", err)
			return
		}
		statsByID[it.productID] = st
	}

	// Group submitted items by normalized target name (preserving stable group order).
	var groupOrder []string
	groups := make(map[string][]applyItem)
	for _, it := range items {
		if _, exists := groups[it.normName]; !exists {
			groupOrder = append(groupOrder, it.normName)
		}
		groups[it.normName] = append(groups[it.normName], it)
	}

	now := db.NowUTC()
	renamedCount := 0
	mergedCount := 0

	for _, normKey := range groupOrder {
		group := groups[normKey]

		// Check if an unselected existing product already has this normalized name.
		var unselectedID int64
		foundUnselected := false
		rows, err := tx.QueryContext(ctx, `SELECT id FROM products WHERE LOWER(TRIM(name)) = ? ORDER BY id ASC`, normKey)
		if err != nil {
			writeInternalError(w, "reclassify apply lookup existing", err)
			return
		}
		for rows.Next() {
			var existingID int64
			if err := rows.Scan(&existingID); err != nil {
				rows.Close()
				writeInternalError(w, "reclassify apply scan existing", err)
				return
			}
			if !seenIDs[existingID] {
				unselectedID = existingID
				foundUnselected = true
				break
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			writeInternalError(w, "reclassify apply iterate existing", err)
			return
		}
		rows.Close()

		if foundUnselected {
			sourceIDs := make([]int64, 0, len(group))
			for _, it := range group {
				sourceIDs = append(sourceIDs, it.productID)
			}
			n, err := s.mergeProductsTx(ctx, tx, unselectedID, sourceIDs, now)
			if err != nil {
				writeInternalError(w, "reclassify apply merge into existing", err)
				return
			}
			mergedCount += n
			continue
		}

		// Pick deterministic survivor among the submitted group:
		// highest inStockCount, then highest variantCount, then lowest id.
		sort.Slice(group, func(i, j int) bool {
			si := statsByID[group[i].productID]
			sj := statsByID[group[j].productID]
			if si.inStockCount != sj.inStockCount {
				return si.inStockCount > sj.inStockCount
			}
			if si.variantCount != sj.variantCount {
				return si.variantCount > sj.variantCount
			}
			return si.id < sj.id
		})

		survivor := group[0]
		survivorStats := statsByID[survivor.productID]
		if survivorStats.currentName != survivor.newName {
			if _, err := tx.ExecContext(ctx, `UPDATE products SET name = ?, updated_at = ? WHERE id = ?`, survivor.newName, now, survivor.productID); err != nil {
				writeInternalError(w, "reclassify apply rename survivor", err)
				return
			}
			renamedCount++
		}

		if len(group) > 1 {
			sourceIDs := make([]int64, 0, len(group)-1)
			for _, it := range group[1:] {
				sourceIDs = append(sourceIDs, it.productID)
			}
			n, err := s.mergeProductsTx(ctx, tx, survivor.productID, sourceIDs, now)
			if err != nil {
				writeInternalError(w, "reclassify apply merge group", err)
				return
			}
			mergedCount += n
		}
	}

	if err := tx.Commit(); err != nil {
		writeInternalError(w, "reclassify apply commit", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"renamed": renamedCount,
		"merged":  mergedCount,
	})
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
	var currentName string
	if err := s.DB.QueryRowContext(r.Context(), `SELECT name FROM products WHERE id = ?`, id).Scan(&currentName); errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "product not found")
		return
	} else if err != nil {
		writeInternalError(w, "update product load current", err)
		return
	}
	if !strings.EqualFold(strings.TrimSpace(req.Name), strings.TrimSpace(currentName)) {
		if existingID, existingName, found, err := s.findProductByNormalizedName(r.Context(), s.DB, req.Name, id); err != nil {
			writeInternalError(w, "update product duplicate check", err)
			return
		} else if found {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error": fmt.Sprintf("A product named %q already exists.", existingName),
				"existing_product": map[string]any{
					"id":   existingID,
					"name": existingName,
				},
			})
			return
		}
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
