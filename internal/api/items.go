package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"time"

	"itemized/internal/db"
	"itemized/internal/domain"
	"itemized/internal/printer"
)

type Item struct {
	ID              int64   `json:"id"`
	LegacyUUID      *string `json:"legacy_uuid,omitempty"`
	ProductID       int64   `json:"product_id"`
	ProductName     string  `json:"product_name,omitempty"`
	VariantID       *int64  `json:"variant_id"`
	VariantName     string  `json:"variant_name,omitempty"`
	LocationID      *int64  `json:"location_id"`
	LocationName    string  `json:"location_name,omitempty"`
	PurchasedOnDate *string `json:"purchased_on_date"`
	OpenedOnDate    *string `json:"opened_on_date"`
	DueOnDate       *string `json:"due_on_date"`
	ConsumedOnDate  *string `json:"consumed_on_date"`
	Notes           *string `json:"notes"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

func (s *Server) listItemsByProduct(ctx context.Context, productID int64, includeConsumed bool) ([]Item, error) {
	query := `
		SELECT i.id, i.legacy_uuid, i.product_id, p.name, i.variant_id, COALESCE(v.name, ''),
		       i.location_id, i.purchased_on_date, i.opened_on_date, i.due_on_date, i.consumed_on_date, i.notes,
		       i.created_at, i.updated_at
		FROM items i
		JOIN products p ON p.id = i.product_id
		LEFT JOIN variants v ON v.id = i.variant_id
		WHERE i.product_id = ?
	`
	if !includeConsumed {
		query += ` AND i.consumed_on_date IS NULL`
	}
	query += ` ORDER BY CASE WHEN i.due_on_date IS NULL THEN 1 ELSE 0 END, i.due_on_date ASC, i.id ASC`
	return s.queryItems(ctx, query, productID)
}

func (s *Server) listItemsByLocation(ctx context.Context, locationID int64) ([]Item, error) {
	query := `
		SELECT i.id, i.legacy_uuid, i.product_id, p.name, i.variant_id, COALESCE(v.name, ''),
		       i.location_id, i.purchased_on_date, i.opened_on_date, i.due_on_date, i.consumed_on_date, i.notes,
		       i.created_at, i.updated_at
		FROM items i
		JOIN products p ON p.id = i.product_id
		LEFT JOIN variants v ON v.id = i.variant_id
		WHERE i.location_id = ? AND i.consumed_on_date IS NULL
		ORDER BY CASE WHEN i.due_on_date IS NULL THEN 1 ELSE 0 END, i.due_on_date ASC, i.id ASC
	`
	return s.queryItems(ctx, query, locationID)
}

func (s *Server) getItemByID(ctx context.Context, id int64) (*Item, error) {
	items, err := s.queryItems(ctx, `
		SELECT i.id, i.legacy_uuid, i.product_id, p.name, i.variant_id, COALESCE(v.name, ''),
		       i.location_id, i.purchased_on_date, i.opened_on_date, i.due_on_date, i.consumed_on_date, i.notes,
		       i.created_at, i.updated_at
		FROM items i
		JOIN products p ON p.id = i.product_id
		LEFT JOIN variants v ON v.id = i.variant_id
		WHERE i.id = ?
	`, id)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, sql.ErrNoRows
	}
	return &items[0], nil
}

func (s *Server) queryItems(ctx context.Context, query string, args ...any) ([]Item, error) {
	_, locMap, err := s.listAllLocations(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Item
	for rows.Next() {
		var it Item
		var lu, purch, opened, due, consumed, notes sql.NullString
		var vid, lid sql.NullInt64
		if err := rows.Scan(
			&it.ID, &lu, &it.ProductID, &it.ProductName, &vid, &it.VariantName,
			&lid, &purch, &opened, &due, &consumed, &notes,
			&it.CreatedAt, &it.UpdatedAt,
		); err != nil {
			return nil, err
		}
		it.LegacyUUID = nullStrPtr(lu)
		it.VariantID = nullInt64Ptr(vid)
		it.LocationID = nullInt64Ptr(lid)
		if it.LocationID != nil {
			if l, ok := locMap[*it.LocationID]; ok {
				it.LocationName = l.HierarchyName
			}
		}
		it.PurchasedOnDate = nullStrPtr(purch)
		it.OpenedOnDate = nullStrPtr(opened)
		it.DueOnDate = nullStrPtr(due)
		it.ConsumedOnDate = nullStrPtr(consumed)
		it.Notes = nullStrPtr(notes)
		list = append(list, it)
	}
	if list == nil {
		list = []Item{}
	}
	return list, rows.Err()
}

func (s *Server) productRecentDueOffsets(ctx context.Context, productID int64) []int {
	var offsets []int
	limit := s.dueDateAverageCount(ctx)
	rows, err := s.DB.QueryContext(ctx, `
		SELECT purchased_on_date, due_on_date FROM items
		WHERE product_id = ? AND purchased_on_date IS NOT NULL AND due_on_date IS NOT NULL
		ORDER BY purchased_on_date DESC, id DESC
		LIMIT ?
	`, productID, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		var pStr, dStr string
		if rows.Scan(&pStr, &dStr) == nil {
			pt, err1 := domain.ParseDate(pStr)
			dt, err2 := domain.ParseDate(dStr)
			if err1 == nil && err2 == nil && pt != nil && dt != nil {
				offsets = append(offsets, int(dt.Sub(*pt).Hours()/24))
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil
	}
	return offsets
}

func (s *Server) productRollingAverageDueDays(ctx context.Context, productID int64) *int {
	return domain.CalculateRollingAverageDueDays(s.productRecentDueOffsets(ctx, productID))
}

func (s *Server) computeProductDueDate(ctx context.Context, product *Product, purchasedOn time.Time) *string {
	var offsets []int
	if product.UseAverageForDueDate {
		offsets = s.productRecentDueOffsets(ctx, product.ID)
	}
	due := domain.CalculatePurchaseDueDate(purchasedOn, product.DefaultDueDays, product.UseAverageForDueDate, offsets)
	return domain.FormatDate(due)
}

func (s *Server) handleCreateItems(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductID       int64   `json:"product_id"`
		VariantID       *int64  `json:"variant_id"`
		LocationID      *int64  `json:"location_id"`
		PurchasedOnDate *string `json:"purchased_on_date"`
		DueOnDate       *string `json:"due_on_date"`
		Notes           *string `json:"notes"`
		Quantity        int     `json:"quantity"`
		LabelPrintMode  string  `json:"label_print_mode"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.ProductID <= 0 {
		writeError(w, http.StatusUnprocessableEntity, "product_id is required")
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	p, err := s.getProductByID(r.Context(), req.ProductID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	locID := req.LocationID
	if locID == nil {
		v := p.DefaultLocationID
		locID = &v
	}

	purchDate := todayUTC()
	if req.PurchasedOnDate != nil && *req.PurchasedOnDate != "" {
		parsed, err := domain.ParseDate(*req.PurchasedOnDate)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid purchased_on_date")
			return
		}
		if parsed != nil {
			purchDate = *parsed
		}
	}
	purchStr := purchDate.Format(domain.DateLayout)

	dueStr := req.DueOnDate
	if dueStr == nil || *dueStr == "" {
		dueStr = s.computeProductDueDate(r.Context(), p, purchDate)
	}

	tx, err := s.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	now := db.NowUTC()
	var createdIDs []int64
	for i := 0; i < req.Quantity; i++ {
		res, err := tx.ExecContext(r.Context(), `
			INSERT INTO items (product_id, variant_id, location_id, purchased_on_date, due_on_date, notes, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, p.ID, req.VariantID, locID, purchStr, dueStr, req.Notes, now, now)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		id, _ := res.LastInsertId()
		createdIDs = append(createdIDs, id)
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE products SET manually_added_to_shopping_list = 0, updated_at = ? WHERE id = ? AND manually_added_to_shopping_list != 0`, now, p.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var created []Item
	for _, id := range createdIDs {
		if it, err := s.getItemByID(r.Context(), id); err == nil {
			created = append(created, *it)
		}
	}

	mode := req.LabelPrintMode
	if mode == "" {
		mode = p.LabelPrintMode
	}
	warnings := s.printBatchForPurchase(r.Context(), r, p, created, mode)

	writeJSON(w, http.StatusCreated, map[string]any{
		"items":          created,
		"print_warnings": warnings,
	})
}

func (s *Server) handleUpdateItem(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	existing, err := s.getItemByID(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var req map[string]any
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	// Apply partial updates (allowing explicit null to clear dates for Undo!).
	locID := existing.LocationID
	if v, ok := req["location_id"]; ok {
		if v == nil {
			locID = nil
		} else if f, ok := v.(float64); ok {
			x := int64(f)
			locID = &x
		}
	}
	varID := existing.VariantID
	if v, ok := req["variant_id"]; ok {
		if v == nil {
			varID = nil
		} else if f, ok := v.(float64); ok {
			x := int64(f)
			varID = &x
		}
	}
	purch := patchNullableString(req, "purchased_on_date", existing.PurchasedOnDate)
	opened := patchNullableString(req, "opened_on_date", existing.OpenedOnDate)
	due := patchNullableString(req, "due_on_date", existing.DueOnDate)
	consumed := patchNullableString(req, "consumed_on_date", existing.ConsumedOnDate)
	notes := patchNullableString(req, "notes", existing.Notes)

	now := db.NowUTC()
	_, err = s.DB.ExecContext(r.Context(), `
		UPDATE items SET variant_id = ?, location_id = ?, purchased_on_date = ?, opened_on_date = ?, due_on_date = ?, consumed_on_date = ?, notes = ?, updated_at = ?
		WHERE id = ?
	`, varID, locID, purch, opened, due, consumed, notes, now, id)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	updated, _ := s.getItemByID(r.Context(), id)
	writeJSON(w, http.StatusOK, map[string]any{"item": updated})
}

func patchNullableString(m map[string]any, key string, current *string) *string {
	v, ok := m[key]
	if !ok {
		return current
	}
	if v == nil {
		return nil
	}
	s, ok := v.(string)
	if !ok || s == "" {
		return nil
	}
	return &s
}

func (s *Server) handleDeleteItem(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	res, err := s.DB.ExecContext(r.Context(), `DELETE FROM items WHERE id = ?`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleConsumeItem(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	prev, err := s.getItemByID(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	today := todayUTC().Format(domain.DateLayout)
	now := db.NowUTC()
	if _, err := s.DB.ExecContext(r.Context(), `UPDATE items SET consumed_on_date = ?, updated_at = ? WHERE id = ?`, today, now, id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	updated, _ := s.getItemByID(r.Context(), id)
	writeJSON(w, http.StatusOK, map[string]any{"item": updated, "previous": prev})
}

func (s *Server) handleOpenItem(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	prev, err := s.getItemByID(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	p, err := s.getProductByID(r.Context(), prev.ProductID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	today := todayUTC()
	var existingDue *time.Time
	if prev.DueOnDate != nil {
		existingDue, _ = domain.ParseDate(*prev.DueOnDate)
	}
	nextDue := domain.FormatDate(domain.CalculateOpenDueDate(today, existingDue, p.DefaultDueDaysOnOpen))
	openStr := today.Format(domain.DateLayout)
	now := db.NowUTC()
	if _, err := s.DB.ExecContext(r.Context(), `UPDATE items SET opened_on_date = ?, due_on_date = ?, updated_at = ? WHERE id = ?`, openStr, nextDue, now, id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	updated, _ := s.getItemByID(r.Context(), id)
	warnings := s.reprintIfDueDateChanged(r.Context(), r, p, prev.DueOnDate, updated)
	writeJSON(w, http.StatusOK, map[string]any{"item": updated, "previous": prev, "print_warnings": warnings})
}

func (s *Server) handleTransferItem(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	var req struct {
		LocationID int64 `json:"location_id"`
	}
	if err := decodeJSON(r, &req); err != nil || req.LocationID <= 0 {
		writeError(w, http.StatusBadRequest, "location_id is required")
		return
	}
	prev, updated, p, err := s.transferSingleItem(r.Context(), id, req.LocationID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item or location not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	warnings := s.reprintIfDueDateChanged(r.Context(), r, p, prev.DueOnDate, updated)
	writeJSON(w, http.StatusOK, map[string]any{"item": updated, "previous": prev, "print_warnings": warnings})
}

func (s *Server) transferSingleItem(ctx context.Context, itemID, targetLocID int64) (*Item, *Item, *Product, error) {
	prev, err := s.getItemByID(ctx, itemID)
	if err != nil {
		return nil, nil, nil, err
	}
	_, locMap, err := s.listAllLocations(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	toLoc, ok := locMap[targetLocID]
	if !ok {
		return nil, nil, nil, sql.ErrNoRows
	}
	fromFreezer := false
	if prev.LocationID != nil {
		if fl, ok := locMap[*prev.LocationID]; ok {
			fromFreezer = fl.IsFreezer
		}
	}
	p, err := s.getProductByID(ctx, prev.ProductID)
	if err != nil {
		return nil, nil, nil, err
	}

	var existingDue *time.Time
	if prev.DueOnDate != nil {
		existingDue, _ = domain.ParseDate(*prev.DueOnDate)
	}
	nextDue := domain.FormatDate(domain.CalculateTransferDueDate(todayUTC(), existingDue, fromFreezer, toLoc.IsFreezer, p.DefaultDueDaysOnFreeze, p.DefaultDueDaysOnThaw))
	now := db.NowUTC()
	if _, err := s.DB.ExecContext(ctx, `UPDATE items SET location_id = ?, due_on_date = ?, updated_at = ? WHERE id = ?`, targetLocID, nextDue, now, itemID); err != nil {
		return nil, nil, nil, err
	}
	updated, err := s.getItemByID(ctx, itemID)
	return prev, updated, p, err
}

func dueDateChanged(prev, next *string) bool {
	p, n := "", ""
	if prev != nil {
		p = *prev
	}
	if next != nil {
		n = *next
	}
	return p != n
}

func (s *Server) reprintIfDueDateChanged(ctx context.Context, r *http.Request, p *Product, prevDue *string, updated *Item) []string {
	if p == nil || updated == nil || p.LabelPrintMode != "per_item" {
		return nil
	}
	if !dueDateChanged(prevDue, updated.DueOnDate) {
		return nil
	}
	return s.printItemLabel(ctx, r, *updated)
}

func (s *Server) handlePrintItemLabel(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	it, err := s.getItemByID(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	warnings := s.printItemLabel(r.Context(), r, *it)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "print_warnings": warnings})
}

func (s *Server) printItemLabel(ctx context.Context, r *http.Request, it Item) []string {
	dueStr := ""
	if it.DueOnDate != nil {
		dueStr = *it.DueOnDate
	}
	purchStr := ""
	if it.PurchasedOnDate != nil {
		purchStr = *it.PurchasedOnDate
	}
	payload := printer.LabelPayload{
		EntityType:      printer.EntityItem,
		ItemID:          it.ID,
		ProductID:       it.ProductID,
		ProductName:     it.ProductName,
		LocationName:    it.LocationName,
		Barcode:         fmt.Sprintf("%s/go/i/%d", s.baseURL(ctx, r), it.ID),
		Quantity:        1,
		PurchasedOnDate: purchStr,
		DueOnDate:       dueStr,
	}
	return s.printToActivePrinters(ctx, printer.EntityItem, payload)
}

func (s *Server) handleBulkItems(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Action     string  `json:"action"` // consume | open | transfer | update_due_date | update_variant | print_label
		ItemIDs    []int64 `json:"item_ids"`
		LocationID *int64  `json:"location_id"`
		DueOnDate  *string `json:"due_on_date"`
		VariantID  *int64  `json:"variant_id"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(req.ItemIDs) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "item_ids is required")
		return
	}

	var warnings []string
	var processed int
	today := todayUTC()
	todayStr := today.Format(domain.DateLayout)
	now := db.NowUTC()

	for _, id := range req.ItemIDs {
		switch req.Action {
		case "consume":
			if _, err := s.DB.ExecContext(r.Context(), `UPDATE items SET consumed_on_date = ?, updated_at = ? WHERE id = ? AND consumed_on_date IS NULL`, todayStr, now, id); err == nil {
				processed++
			}
		case "open":
			if prev, err := s.getItemByID(r.Context(), id); err == nil {
				if p, err := s.getProductByID(r.Context(), prev.ProductID); err == nil {
					var existingDue *time.Time
					if prev.DueOnDate != nil {
						existingDue, _ = domain.ParseDate(*prev.DueOnDate)
					}
					nextDue := domain.FormatDate(domain.CalculateOpenDueDate(today, existingDue, p.DefaultDueDaysOnOpen))
					if _, err := s.DB.ExecContext(r.Context(), `UPDATE items SET opened_on_date = ?, due_on_date = ?, updated_at = ? WHERE id = ?`, todayStr, nextDue, now, id); err == nil {
						processed++
						if updated, err := s.getItemByID(r.Context(), id); err == nil {
							warnings = append(warnings, s.reprintIfDueDateChanged(r.Context(), r, p, prev.DueOnDate, updated)...)
						}
					}
				}
			}
		case "transfer":
			if req.LocationID == nil || *req.LocationID <= 0 {
				writeError(w, http.StatusUnprocessableEntity, "location_id is required for transfer")
				return
			}
			if prev, updated, prod, err := s.transferSingleItem(r.Context(), id, *req.LocationID); err == nil {
				processed++
				warnings = append(warnings, s.reprintIfDueDateChanged(r.Context(), r, prod, prev.DueOnDate, updated)...)
			}
		case "update_due_date":
			if _, err := s.DB.ExecContext(r.Context(), `UPDATE items SET due_on_date = ?, updated_at = ? WHERE id = ?`, req.DueOnDate, now, id); err == nil {
				processed++
			}
		case "update_variant":
			if _, err := s.DB.ExecContext(r.Context(), `UPDATE items SET variant_id = ?, updated_at = ? WHERE id = ?`, req.VariantID, now, id); err == nil {
				processed++
			}
		case "print_label":
			if it, err := s.getItemByID(r.Context(), id); err == nil {
				warnings = append(warnings, s.printItemLabel(r.Context(), r, *it)...)
				processed++
			}
		default:
			writeError(w, http.StatusUnprocessableEntity, "unsupported bulk action")
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"processed":      processed,
		"print_warnings": warnings,
	})
}
