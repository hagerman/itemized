package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"itemized/internal/db"
	"itemized/internal/domain"
	"itemized/internal/llm"
	"itemized/internal/printer"
)

var (
	qrPathRegex = regexp.MustCompile(`(?i)/go/([ipl])/([0-9a-f-]+)(?:[/?#]|$)`)
	uuidRegex   = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

// --- Unified Scan Resolution ---

func (s *Server) handleScanResolve(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Input string `json:"input"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	raw := strings.TrimSpace(req.Input)
	if raw == "" {
		writeError(w, http.StatusUnprocessableEntity, "input is required")
		return
	}

	ctx := r.Context()

	// 1. Check for /go/{i,p,l}/{id-or-uuid} on any hostname
	if m := qrPathRegex.FindStringSubmatch(raw); len(m) == 3 {
		kindCode := strings.ToLower(m[1])
		token := m[2]
		switch kindCode {
		case "i":
			if it, err := s.resolveItemByToken(ctx, token); err == nil {
				p, _ := s.getProductByID(ctx, it.ProductID)
				writeJSON(w, http.StatusOK, map[string]any{
					"kind":    "item",
					"item":    it,
					"product": p,
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"kind": "unknown", "input": raw})
			return
		case "p":
			if p, err := s.resolveProductByToken(ctx, token); err == nil {
				items, _ := s.listItemsByProduct(ctx, p.ID, false)
				writeJSON(w, http.StatusOK, map[string]any{
					"kind":    "product",
					"product": p,
					"items":   items,
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"kind": "unknown", "input": raw})
			return
		case "l":
			if loc, err := s.resolveLocationByToken(ctx, token); err == nil {
				items, _ := s.listItemsByLocation(ctx, loc.ID)
				writeJSON(w, http.StatusOK, map[string]any{
					"kind":     "location",
					"location": loc,
					"items":    items,
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"kind": "unknown", "input": raw})
			return
		}
	}

	// 2. Bare UUID fallback across items -> products -> locations
	if uuidRegex.MatchString(raw) {
		if it, err := s.resolveItemByToken(ctx, raw); err == nil {
			p, _ := s.getProductByID(ctx, it.ProductID)
			writeJSON(w, http.StatusOK, map[string]any{"kind": "item", "item": it, "product": p})
			return
		}
		if p, err := s.resolveProductByToken(ctx, raw); err == nil {
			items, _ := s.listItemsByProduct(ctx, p.ID, false)
			writeJSON(w, http.StatusOK, map[string]any{"kind": "product", "product": p, "items": items})
			return
		}
		if loc, err := s.resolveLocationByToken(ctx, raw); err == nil {
			items, _ := s.listItemsByLocation(ctx, loc.ID)
			writeJSON(w, http.StatusOK, map[string]any{"kind": "location", "location": loc, "items": items})
			return
		}
	}

	// 3. Retail barcode lookup in barcodes table (exact match first, then equivalent GTIN/UPC/EAN forms)
	for _, candidate := range retailBarcodeCandidates(raw) {
		var b Barcode
		var productID int64
		var variantName string
		err := s.DB.QueryRowContext(ctx, `
			SELECT b.id, b.variant_id, b.barcode, b.default_quantity, b.created_at, b.updated_at, v.product_id, v.name
			FROM barcodes b
			JOIN variants v ON v.id = b.variant_id
			WHERE b.barcode = ?
		`, candidate).Scan(&b.ID, &b.VariantID, &b.Barcode, &b.DefaultQuantity, &b.CreatedAt, &b.UpdatedAt, &productID, &variantName)
		if err == nil {
			p, _ := s.getProductByID(ctx, productID)
			items, _ := s.listItemsByProduct(ctx, productID, false)
			writeJSON(w, http.StatusOK, map[string]any{
				"kind":         "barcode",
				"barcode":      b,
				"variant_id":   b.VariantID,
				"variant_name": variantName,
				"product":      p,
				"items":        items,
			})
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"kind":    "unknown",
		"barcode": raw,
	})
}

func isASCIIAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// retailBarcodeCandidates returns ordered candidate barcode strings to look up
// in the barcodes table: exact trimmed input first, followed by leading-zero
// equivalent GTIN/UPC/EAN forms for 11-14 digit numeric retail barcodes.
func retailBarcodeCandidates(raw string) []string {
	candidates := []string{raw}
	if len(raw) < 11 || len(raw) > 14 || !isASCIIAllDigits(raw) {
		return candidates
	}
	trimmed := strings.TrimLeft(raw, "0")
	if trimmed == "" {
		return candidates
	}
	seen := map[string]bool{raw: true}
	add := func(s string) {
		if s != "" && !seen[s] {
			seen[s] = true
			candidates = append(candidates, s)
		}
	}
	for _, targetLen := range []int{12, 13, 14} {
		if len(trimmed) <= targetLen {
			add(strings.Repeat("0", targetLen-len(trimmed)) + trimmed)
		}
	}
	if len(trimmed) >= 6 {
		add(trimmed)
	}
	return candidates
}

func (s *Server) resolveItemByToken(ctx context.Context, token string) (*Item, error) {
	if id, err := strconv.ParseInt(token, 10, 64); err == nil {
		return s.getItemByID(ctx, id)
	}
	var id int64
	if err := s.DB.QueryRowContext(ctx, `SELECT id FROM items WHERE legacy_uuid = ?`, strings.ToLower(token)).Scan(&id); err != nil {
		return nil, err
	}
	return s.getItemByID(ctx, id)
}

func (s *Server) resolveProductByToken(ctx context.Context, token string) (*Product, error) {
	id, err := s.resolveProductIDByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	return s.getProductByID(ctx, id)
}

func (s *Server) resolveLocationByToken(ctx context.Context, token string) (*Location, error) {
	_, byID, err := s.listAllLocations(ctx)
	if err != nil {
		return nil, err
	}
	if id, err := strconv.ParseInt(token, 10, 64); err == nil {
		if l, ok := byID[id]; ok {
			return &l, nil
		}
		return nil, sql.ErrNoRows
	}
	var id int64
	if err := s.DB.QueryRowContext(ctx, `SELECT id FROM locations WHERE legacy_uuid = ?`, strings.ToLower(token)).Scan(&id); err != nil {
		return nil, err
	}
	if l, ok := byID[id]; ok {
		return &l, nil
	}
	return nil, sql.ErrNoRows
}

// --- Purchase Workflow ---

func (s *Server) handlePurchaseWorkflow(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductID          *int64        `json:"product_id"`
		NewProduct         *productInput `json:"new_product"`
		VariantID          *int64        `json:"variant_id"`
		VariantName        string        `json:"variant_name"`
		VariantVolumeValue *float64      `json:"variant_volume_value"`
		VariantVolumeUnit  *string       `json:"variant_volume_unit"`
		VariantWeightValue *float64      `json:"variant_weight_value"`
		VariantWeightUnit  *string       `json:"variant_weight_unit"`
		VariantLengthValue *float64      `json:"variant_length_value"`
		VariantLengthUnit  *string       `json:"variant_length_unit"`
		Barcode            string        `json:"barcode"`
		BarcodeQuantity    int           `json:"barcode_quantity"`
		SecondBarcode      string        `json:"second_barcode"`
		SecondBarcodeQty   int           `json:"second_barcode_quantity"`
		LocationID         *int64        `json:"location_id"`
		PurchasedOnDate    *string       `json:"purchased_on_date"`
		DueOnDate          *string       `json:"due_on_date"`
		Quantity           int           `json:"quantity"`
		Notes              *string       `json:"notes"`
		LabelPrintMode     string        `json:"label_print_mode"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ProductID == nil && req.NewProduct == nil {
		writeError(w, http.StatusUnprocessableEntity, "product_id or new_product is required")
		return
	}
	if req.NewProduct != nil {
		if err := req.NewProduct.validate(); err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}
	variantMeasurement := domain.Measurement{
		VolumeValue: req.VariantVolumeValue,
		VolumeUnit:  req.VariantVolumeUnit,
		WeightValue: req.VariantWeightValue,
		WeightUnit:  req.VariantWeightUnit,
		LengthValue: req.VariantLengthValue,
		LengthUnit:  req.VariantLengthUnit,
	}
	if err := domain.ValidateMeasurement(variantMeasurement); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}
	if req.Quantity > maxBatchQuantity {
		writeError(w, http.StatusUnprocessableEntity, fmt.Sprintf("quantity cannot exceed %d", maxBatchQuantity))
		return
	}

	tx, err := s.DB.BeginTx(r.Context(), nil)
	if err != nil {
		writeInternalError(w, "purchase begin tx", err)
		return
	}
	defer tx.Rollback()

	now := db.NowUTC()
	var productID int64
	if req.ProductID != nil && *req.ProductID > 0 {
		productID = *req.ProductID
	} else {
		productID, err = s.insertProduct(r.Context(), tx, *req.NewProduct)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "unable to create product")
			return
		}
	}

	variantID := req.VariantID
	primaryBarcode := strings.TrimSpace(req.Barcode)
	secondBarcode := strings.TrimSpace(req.SecondBarcode)

	hasVariantMeasurement := req.VariantVolumeValue != nil || req.VariantWeightValue != nil || req.VariantLengthValue != nil
	if variantID == nil && (primaryBarcode != "" || secondBarcode != "" || strings.TrimSpace(req.VariantName) != "" || hasVariantMeasurement) {
		vName := strings.TrimSpace(req.VariantName)
		if vName == "" {
			vName = "Default"
		}
		res, err := tx.ExecContext(r.Context(), `
			INSERT INTO variants (product_id, name, volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, productID, vName, req.VariantVolumeValue, req.VariantVolumeUnit, req.VariantWeightValue, req.VariantWeightUnit, req.VariantLengthValue, req.VariantLengthUnit, now, now)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "unable to create variant")
			return
		}
		vid, _ := res.LastInsertId()
		variantID = &vid
	}

	if variantID != nil && primaryBarcode != "" {
		qty := req.BarcodeQuantity
		if qty <= 0 {
			qty = 1
		}
		if _, err := tx.ExecContext(r.Context(), `
			INSERT OR IGNORE INTO barcodes (variant_id, barcode, default_quantity, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`, *variantID, primaryBarcode, qty, now, now); err != nil {
			writeError(w, http.StatusUnprocessableEntity, "unable to save barcode")
			return
		}
	}
	if variantID != nil && secondBarcode != "" {
		qty := req.SecondBarcodeQty
		if qty <= 0 {
			qty = 1
		}
		if _, err := tx.ExecContext(r.Context(), `
			INSERT OR IGNORE INTO barcodes (variant_id, barcode, default_quantity, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`, *variantID, secondBarcode, qty, now, now); err != nil {
			writeError(w, http.StatusUnprocessableEntity, "unable to save barcode")
			return
		}
	}

	// Determine location and dates
	var defaultLocID int64
	var defaultPrintMode string
	if err := tx.QueryRowContext(r.Context(), `SELECT default_location_id, label_print_mode FROM products WHERE id = ?`, productID).Scan(&defaultLocID, &defaultPrintMode); err != nil {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	locID := defaultLocID
	if req.LocationID != nil && *req.LocationID > 0 {
		locID = *req.LocationID
	}

	purchDate := todayUTC()
	if req.PurchasedOnDate != nil && *req.PurchasedOnDate != "" {
		if parsed, err := domain.ParseDate(*req.PurchasedOnDate); err == nil && parsed != nil {
			purchDate = *parsed
		}
	}
	purchStr := purchDate.Format(domain.DateLayout)

	var createdIDs []int64
	for i := 0; i < req.Quantity; i++ {
		res, err := tx.ExecContext(r.Context(), `
			INSERT INTO items (product_id, variant_id, location_id, purchased_on_date, due_on_date, notes, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, productID, variantID, locID, purchStr, req.DueOnDate, req.Notes, now, now)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "unable to create item")
			return
		}
		id, _ := res.LastInsertId()
		createdIDs = append(createdIDs, id)
	}

	if _, err := tx.ExecContext(r.Context(), `UPDATE products SET manually_added_to_shopping_list = 0, updated_at = ? WHERE id = ? AND manually_added_to_shopping_list != 0`, now, productID); err != nil {
		writeInternalError(w, "purchase clear shopping list", err)
		return
	}

	if err := tx.Commit(); err != nil {
		writeInternalError(w, "purchase commit", err)
		return
	}

	p, _ := s.getProductByID(r.Context(), productID)
	// Fill auto due date if none was supplied explicitly.
	if (req.DueOnDate == nil || *req.DueOnDate == "") && p != nil {
		if autoDue := s.computeProductDueDate(r.Context(), p, purchDate); autoDue != nil {
			for _, id := range createdIDs {
				_, _ = s.DB.ExecContext(r.Context(), `UPDATE items SET due_on_date = ? WHERE id = ?`, *autoDue, id)
			}
		}
	}

	var created []Item
	for _, id := range createdIDs {
		if it, err := s.getItemByID(r.Context(), id); err == nil {
			created = append(created, *it)
		}
	}

	mode := req.LabelPrintMode
	if mode == "" {
		mode = defaultPrintMode
	}
	warnings := s.printBatchForPurchase(r.Context(), r, p, created, mode)

	writeJSON(w, http.StatusCreated, map[string]any{
		"product":        p,
		"items":          created,
		"print_warnings": warnings,
	})
}

// --- Inventory Audit Workflow ---

func (s *Server) handleInventorySummary(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LocationID      int64 `json:"location_id"`
		ScannedItemIDs  []int64 `json:"scanned_item_ids"`
		ScannedProducts []struct {
			ProductID int64 `json:"product_id"`
			Quantity  int   `json:"quantity"`
		} `json:"scanned_products"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.LocationID <= 0 {
		writeError(w, http.StatusBadRequest, "location_id is required")
		return
	}

	ctx := r.Context()
	atLoc, err := s.listItemsByLocation(ctx, req.LocationID)
	if err != nil {
		writeInternalError(w, "inventory summary list items", err)
		return
	}
	atLocByID := make(map[int64]Item, len(atLoc))
	for _, it := range atLoc {
		atLocByID[it.ID] = it
	}

	claimedIDs := make(map[int64]bool)
	var toConfirm []Item
	var toTransfer []Item
	type createProposal struct {
		ProductID   int64   `json:"product_id"`
		ProductName string  `json:"product_name"`
		Quantity    int     `json:"quantity"`
		DueOnDate   *string `json:"due_on_date"`
	}
	var toCreate []createProposal

	// 1. Exact scanned items
	for _, id := range req.ScannedItemIDs {
		if claimedIDs[id] {
			continue
		}
		claimedIDs[id] = true
		if it, ok := atLocByID[id]; ok {
			toConfirm = append(toConfirm, it)
		} else if it, err := s.getItemByID(ctx, id); err == nil && it.ConsumedOnDate == nil {
			toTransfer = append(toTransfer, *it)
		}
	}

	// 2. Product-level quantity scans (prefer unclaimed items at this location, then other locations, else create)
	for _, sp := range req.ScannedProducts {
		if sp.ProductID <= 0 || sp.Quantity <= 0 {
			continue
		}
		allProdItems, _ := s.listItemsByProduct(ctx, sp.ProductID, false)
		remaining := sp.Quantity
		for _, it := range allProdItems {
			if remaining == 0 {
				break
			}
			if claimedIDs[it.ID] {
				continue
			}
			if it.LocationID != nil && *it.LocationID == req.LocationID {
				claimedIDs[it.ID] = true
				toConfirm = append(toConfirm, it)
				remaining--
			}
		}
		for _, it := range allProdItems {
			if remaining == 0 {
				break
			}
			if claimedIDs[it.ID] {
				continue
			}
			claimedIDs[it.ID] = true
			toTransfer = append(toTransfer, it)
			remaining--
		}
		if remaining > 0 {
			if p, err := s.getProductByID(ctx, sp.ProductID); err == nil {
				toCreate = append(toCreate, createProposal{
					ProductID:   p.ID,
					ProductName: p.Name,
					Quantity:    remaining,
					DueOnDate:   s.computeProductDueDate(ctx, p, todayUTC()),
				})
			}
		}
	}

	// 3. Unclaimed items still at location -> propose consume
	var toConsume []Item
	for _, it := range atLoc {
		if !claimedIDs[it.ID] {
			toConsume = append(toConsume, it)
		}
	}

	if toConsume == nil {
		toConsume = []Item{}
	}
	if toTransfer == nil {
		toTransfer = []Item{}
	}
	if toConfirm == nil {
		toConfirm = []Item{}
	}
	if toCreate == nil {
		toCreate = []createProposal{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"to_consume":  toConsume,
		"to_transfer": toTransfer,
		"to_confirm":  toConfirm,
		"to_create":   toCreate,
	})
}

func (s *Server) handleInventoryApply(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LocationID      int64   `json:"location_id"`
		ConsumeItemIDs  []int64 `json:"consume_item_ids"`
		TransferItemIDs []int64 `json:"transfer_item_ids"`
		CreateItems     []struct {
			ProductID int64   `json:"product_id"`
			Quantity  int     `json:"quantity"`
			DueOnDate *string `json:"due_on_date"`
		} `json:"create_items"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.LocationID <= 0 {
		writeError(w, http.StatusBadRequest, "location_id is required")
		return
	}
	totalCreate := 0
	for _, c := range req.CreateItems {
		if c.Quantity > maxBatchQuantity {
			writeError(w, http.StatusUnprocessableEntity, fmt.Sprintf("quantity cannot exceed %d", maxBatchQuantity))
			return
		}
		if c.Quantity > 0 {
			totalCreate += c.Quantity
			if totalCreate > maxBatchQuantity {
				writeError(w, http.StatusUnprocessableEntity, fmt.Sprintf("total create quantity cannot exceed %d", maxBatchQuantity))
				return
			}
		}
	}

	ctx := r.Context()
	_, locMap, err := s.listAllLocations(ctx)
	if err != nil {
		writeInternalError(w, "inventory apply list locations", err)
		return
	}
	toLoc, ok := locMap[req.LocationID]
	if !ok {
		writeError(w, http.StatusNotFound, "location not found")
		return
	}

	today := todayUTC()
	todayStr := today.Format(domain.DateLayout)

	// Pre-compute transfer due dates (freeze/thaw) and create auto due dates before transaction.
	type transferPlan struct {
		itemID  int64
		prevDue *string
		nextDue *string
		product *Product
	}
	var transferPlans []transferPlan
	for _, id := range req.TransferItemIDs {
		prev, err := s.getItemByID(ctx, id)
		if err != nil || prev.ConsumedOnDate != nil {
			continue
		}
		prod, err := s.getProductByID(ctx, prev.ProductID)
		if err != nil {
			continue
		}
		fromFreezer := false
		if prev.LocationID != nil {
			if fl, exists := locMap[*prev.LocationID]; exists {
				fromFreezer = fl.IsFreezer
			}
		}
		var existingDue *time.Time
		if prev.DueOnDate != nil {
			existingDue, _ = domain.ParseDate(*prev.DueOnDate)
		}
		nextDue := domain.FormatDate(domain.CalculateTransferDueDate(today, existingDue, fromFreezer, toLoc.IsFreezer, prod.DefaultDueDaysOnFreeze, prod.DefaultDueDaysOnThaw))
		transferPlans = append(transferPlans, transferPlan{
			itemID:  id,
			prevDue: prev.DueOnDate,
			nextDue: nextDue,
			product: prod,
		})
	}

	createDueDates := make([]*string, len(req.CreateItems))
	for i, c := range req.CreateItems {
		if c.DueOnDate != nil && *c.DueOnDate != "" {
			createDueDates[i] = c.DueOnDate
		} else if c.ProductID > 0 {
			if p, err := s.getProductByID(ctx, c.ProductID); err == nil {
				createDueDates[i] = s.computeProductDueDate(ctx, p, today)
			}
		}
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeInternalError(w, "inventory apply begin tx", err)
		return
	}
	defer tx.Rollback()

	now := db.NowUTC()

	consumedCount := 0
	for _, id := range req.ConsumeItemIDs {
		res, err := tx.ExecContext(ctx, `UPDATE items SET consumed_on_date = ?, updated_at = ? WHERE id = ? AND consumed_on_date IS NULL`, todayStr, now, id)
		if err != nil {
			writeInternalError(w, "inventory apply consume", err)
			return
		}
		if n, _ := res.RowsAffected(); n > 0 {
			consumedCount++
		}
	}

	transferredCount := 0
	for _, tp := range transferPlans {
		res, err := tx.ExecContext(ctx, `UPDATE items SET location_id = ?, due_on_date = ?, updated_at = ? WHERE id = ? AND consumed_on_date IS NULL`, req.LocationID, tp.nextDue, now, tp.itemID)
		if err != nil {
			writeInternalError(w, "inventory apply transfer", err)
			return
		}
		if n, _ := res.RowsAffected(); n > 0 {
			transferredCount++
		}
	}

	createdCount := 0
	for idx, c := range req.CreateItems {
		if c.ProductID <= 0 || c.Quantity <= 0 {
			continue
		}
		for i := 0; i < c.Quantity; i++ {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO items (product_id, location_id, purchased_on_date, due_on_date, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`, c.ProductID, req.LocationID, todayStr, createDueDates[idx], now, now); err != nil {
				writeError(w, http.StatusUnprocessableEntity, "unable to create item")
				return
			}
			createdCount++
		}
	}

	if err := tx.Commit(); err != nil {
		writeInternalError(w, "inventory apply commit", err)
		return
	}

	var warnings []string
	for _, tp := range transferPlans {
		if updated, err := s.getItemByID(ctx, tp.itemID); err == nil {
			warnings = append(warnings, s.reprintIfDueDateChanged(ctx, r, tp.product, tp.prevDue, updated)...)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"consumed":       consumedCount,
		"transferred":    transferredCount,
		"created":        createdCount,
		"print_warnings": warnings,
	})
}

// --- UPC & LLM Handlers ---

func (s *Server) handleUPCLookup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Barcode string `json:"barcode"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Barcode) == "" {
		writeError(w, http.StatusBadRequest, "barcode is required")
		return
	}
	res, err := s.UPC.Lookup(r.Context(), req.Barcode)
	if err != nil {
		log.Printf("upc lookup warning: %v", err)
		// Graceful degradation so Purchase workflow can continue manually.
		writeJSON(w, http.StatusOK, map[string]any{"found": false, "warning": "upc lookup unavailable"})
		return
	}
	if res == nil {
		writeJSON(w, http.StatusOK, map[string]any{"found": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"found": true, "result": res})
}

func (s *Server) handleUPCClassify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title    string `json:"title"`
		Quantity string `json:"quantity"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	cfg := s.llmConfig(r.Context())
	if !cfg.Enabled() {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false, "classification": nil})
		return
	}
	cats, _, err := s.listAllCategories(r.Context())
	if err != nil {
		writeInternalError(w, "upc classify list categories", err)
		return
	}
	opts := make([]llm.CategoryOption, 0, len(cats))
	for _, c := range cats {
		opts = append(opts, llm.CategoryOption{ID: c.ID, Name: c.HierarchyName})
	}
	out, err := s.LLM.Classify(r.Context(), cfg, req.Title, req.Quantity, opts)
	if err != nil {
		log.Printf("upc classify warning (provider=%s model=%s): %v", cfg.Provider, cfg.Model, err)
		writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "classification": nil, "warning": "classification unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "classification": out})
}

// --- Printers & Label Templates ---

type PrinterRecord struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	Description  *string `json:"description"`
	Driver       string  `json:"driver"`
	Endpoint     string  `json:"endpoint"`
	PrinterModel *string `json:"printer_model"`
	Enabled      bool    `json:"enabled"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

func (s *Server) listPrinters(ctx context.Context, enabledOnly bool) ([]PrinterRecord, error) {
	q := `SELECT id, name, description, driver, endpoint, printer_model, enabled, created_at, updated_at FROM printers`
	if enabledOnly {
		q += ` WHERE enabled = 1`
	}
	q += ` ORDER BY id ASC`
	rows, err := s.DB.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []PrinterRecord
	for rows.Next() {
		var p PrinterRecord
		var desc, model sql.NullString
		var en int
		if err := rows.Scan(&p.ID, &p.Name, &desc, &p.Driver, &p.Endpoint, &model, &en, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.Description = nullStrPtr(desc)
		p.PrinterModel = nullStrPtr(model)
		p.Enabled = en != 0
		list = append(list, p)
	}
	if list == nil {
		list = []PrinterRecord{}
	}
	return list, rows.Err()
}

func (s *Server) getTemplateOverride(ctx context.Context, entityType string) string {
	var content string
	if err := s.DB.QueryRowContext(ctx, `SELECT content FROM label_templates WHERE entity_type = ?`, entityType).Scan(&content); err == nil {
		return content
	}
	return ""
}

func (s *Server) printToActivePrinters(ctx context.Context, entityType string, payload printer.LabelPayload) []string {
	printers, err := s.listPrinters(ctx, true)
	if err != nil || len(printers) == 0 {
		return nil
	}
	override := s.getTemplateOverride(ctx, entityType)
	var warnings []string
	for _, pr := range printers {
		cfg := printer.PrinterConfig{
			ID:       pr.ID,
			Name:     pr.Name,
			Driver:   pr.Driver,
			Endpoint: pr.Endpoint,
			Enabled:  pr.Enabled,
		}
		if err := s.Printer.Print(ctx, cfg, entityType, override, payload); err != nil {
			warnings = append(warnings, fmt.Sprintf("%s: %v", pr.Name, err))
		}
	}
	return warnings
}

func (s *Server) printBatchForPurchase(ctx context.Context, r *http.Request, p *Product, items []Item, mode string) []string {
	if p == nil || len(items) == 0 || mode == "none" {
		return nil
	}
	if mode == "single" {
		payload := printer.LabelPayload{
			EntityType:   printer.EntityProduct,
			ProductID:    p.ID,
			ProductName:  p.Name,
			CategoryName: p.CategoryName,
			LocationName: p.DefaultLocationName,
			Barcode:      fmt.Sprintf("%s/go/p/%d", s.baseURL(ctx, r), p.ID),
		}
		return s.printToActivePrinters(ctx, printer.EntityProduct, payload)
	}
	var warnings []string
	for _, it := range items {
		warnings = append(warnings, s.printItemLabel(ctx, r, it)...)
	}
	return warnings
}

func (s *Server) handleListPrinters(w http.ResponseWriter, r *http.Request) {
	list, err := s.listPrinters(r.Context(), false)
	if err != nil {
		writeInternalError(w, "list printers", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"printers": list})
}

func (s *Server) handleCreatePrinter(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name         string  `json:"name"`
		Description  *string `json:"description"`
		Driver       string  `json:"driver"`
		Endpoint     string  `json:"endpoint"`
		PrinterModel *string `json:"printer_model"`
		Enabled      *bool   `json:"enabled"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Endpoint = strings.TrimSpace(req.Endpoint)
	if req.Name == "" || req.Endpoint == "" {
		writeError(w, http.StatusUnprocessableEntity, "name and endpoint are required")
		return
	}
	if req.Driver == "" {
		req.Driver = printer.DriverIPPZPL
	}
	if req.Driver != printer.DriverIPPZPL && req.Driver != printer.DriverRawTCPZPL {
		writeError(w, http.StatusUnprocessableEntity, "invalid driver")
		return
	}
	if req.Driver == printer.DriverRawTCPZPL {
		normalized, err := printer.NormalizeRawTCPEndpoint(req.Endpoint)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid raw tcp endpoint")
			return
		}
		req.Endpoint = normalized
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		INSERT INTO printers (name, description, driver, endpoint, printer_model, enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, req.Name, req.Description, req.Driver, req.Endpoint, req.PrinterModel, boolToInt(enabled), now, now)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "unable to create printer")
		return
	}
	id, _ := res.LastInsertId()
	writeJSON(w, http.StatusCreated, map[string]any{
		"printer": PrinterRecord{
			ID: id, Name: req.Name, Description: req.Description, Driver: req.Driver,
			Endpoint: req.Endpoint, PrinterModel: req.PrinterModel, Enabled: enabled,
			CreatedAt: now, UpdatedAt: now,
		},
	})
}

func (s *Server) handleUpdatePrinter(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid printer id")
		return
	}
	var req struct {
		Name         string  `json:"name"`
		Description  *string `json:"description"`
		Driver       string  `json:"driver"`
		Endpoint     string  `json:"endpoint"`
		PrinterModel *string `json:"printer_model"`
		Enabled      bool    `json:"enabled"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Driver != printer.DriverIPPZPL && req.Driver != printer.DriverRawTCPZPL {
		writeError(w, http.StatusUnprocessableEntity, "invalid driver")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Endpoint = strings.TrimSpace(req.Endpoint)
	if req.Driver == printer.DriverRawTCPZPL {
		normalized, err := printer.NormalizeRawTCPEndpoint(req.Endpoint)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid raw tcp endpoint")
			return
		}
		req.Endpoint = normalized
	}
	now := db.NowUTC()
	res, err := s.DB.ExecContext(r.Context(), `
		UPDATE printers SET name = ?, description = ?, driver = ?, endpoint = ?, printer_model = ?, enabled = ?, updated_at = ?
		WHERE id = ?
	`, req.Name, req.Description, req.Driver, req.Endpoint, req.PrinterModel, boolToInt(req.Enabled), now, id)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "unable to update printer")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "printer not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeletePrinter(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid printer id")
		return
	}
	res, err := s.DB.ExecContext(r.Context(), `DELETE FROM printers WHERE id = ?`, id)
	if err != nil {
		writeInternalError(w, "delete printer", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "printer not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleTestPrinter(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid printer id")
		return
	}
	var p PrinterRecord
	err = s.DB.QueryRowContext(r.Context(), `SELECT id, name, driver, endpoint FROM printers WHERE id = ?`, id).Scan(&p.ID, &p.Name, &p.Driver, &p.Endpoint)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "printer not found")
		return
	}
	if err != nil {
		writeInternalError(w, "test printer load", err)
		return
	}
	override := s.getTemplateOverride(r.Context(), printer.EntityItem)
	payload := printer.LabelPayload{
		EntityType:  printer.EntityItem,
		ItemID:      0,
		ProductName: "Itemized Test Label",
		Barcode:     s.baseURL(r.Context(), r),
		DueOnDate:   todayUTC().Format(domain.DateLayout),
	}
	err = s.Printer.Print(r.Context(), printer.PrinterConfig{
		ID: p.ID, Name: p.Name, Driver: p.Driver, Endpoint: p.Endpoint, Enabled: true,
	}, printer.EntityItem, override, payload)
	if err != nil {
		log.Printf("test printer %d (%s) failed: %v", p.ID, p.Name, err)
		writeError(w, http.StatusBadGateway, "printer test failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleListLabelTemplates(w http.ResponseWriter, r *http.Request) {
	types := []string{printer.EntityItem, printer.EntityProduct, printer.EntityLocation}
	type tmplView struct {
		EntityType string `json:"entity_type"`
		Content    string `json:"content"`
		IsCustom   bool   `json:"is_custom"`
		Default    string `json:"default_content"`
	}
	var out []tmplView
	for _, et := range types {
		def, _ := printer.DefaultTemplate(et)
		override := s.getTemplateOverride(r.Context(), et)
		view := tmplView{
			EntityType: et,
			Content:    def,
			IsCustom:   false,
			Default:    def,
		}
		if strings.TrimSpace(override) != "" {
			view.Content = override
			view.IsCustom = true
		}
		out = append(out, view)
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": out})
}

func (s *Server) handleUpsertLabelTemplate(w http.ResponseWriter, r *http.Request) {
	et := r.PathValue("entityType")
	if et != printer.EntityItem && et != printer.EntityProduct && et != printer.EntityLocation {
		writeError(w, http.StatusBadRequest, "invalid entity_type")
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeError(w, http.StatusUnprocessableEntity, "content is required")
		return
	}
	// Validate template syntax before saving.
	if _, err := s.Printer.Render(et, req.Content, printer.LabelPayload{ProductName: "Test", LocationName: "Test", Barcode: "https://example.com"}, ""); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	now := db.NowUTC()
	_, err := s.DB.ExecContext(r.Context(), `
		INSERT INTO label_templates (entity_type, content, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(entity_type) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
	`, et, req.Content, now)
	if err != nil {
		writeInternalError(w, "upsert label template", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleResetLabelTemplate(w http.ResponseWriter, r *http.Request) {
	et := r.PathValue("entityType")
	if et != printer.EntityItem && et != printer.EntityProduct && et != printer.EntityLocation {
		writeError(w, http.StatusBadRequest, "invalid entity_type")
		return
	}
	if _, err := s.DB.ExecContext(r.Context(), `DELETE FROM label_templates WHERE entity_type = ?`, et); err != nil {
		writeInternalError(w, "reset label template", err)
		return
	}
	def, _ := printer.DefaultTemplate(et)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "content": def})
}
