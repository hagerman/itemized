package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"

	"itemized/internal/db"
	"itemized/internal/printer"
)

type fakeDriver struct {
	jobs []string
	fail bool
}

func (f *fakeDriver) Print(_ context.Context, _ string, zpl []byte) error {
	if f.fail {
		return errors.New("printer offline")
	}
	f.jobs = append(f.jobs, string(zpl))
	return nil
}

func (f *fakeDriver) MediaReady(_ context.Context, _ string) (string, error) {
	return "na_label_2.25x1in", nil
}

func doReq(t *testing.T, h http.Handler, method, path string, body any, bearer string) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestFullAPILifecycle(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	drv := &fakeDriver{}
	srv.Printer.RegisterDriver(printer.DriverIPPZPL, drv)
	h := srv.Handler()

	// 1. Healthcheck
	rec := doReq(t, h, http.MethodGet, "/up", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /up expected 200, got %d", rec.Code)
	}

	// 2. First-run admin setup + lockout
	rec = doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{
		"email": "admin@home.local", "password": "password123",
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("setup expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{
		"email": "evil@home.local", "password": "password123",
	}, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("second setup expected 403, got %d", rec.Code)
	}

	// 3. Bearer login for admin, create member, verify member gets 403 on /api/users
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123", "mode": "bearer",
	}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("admin login expected 200, got %d", rec.Code)
	}
	var loginResp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	adminTok := loginResp.Token

	rec = doReq(t, h, http.MethodPost, "/api/users", map[string]any{
		"email": "member@home.local", "password": "password123", "role": "member",
	}, adminTok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create member expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "member@home.local", "password": "password123", "mode": "bearer",
	}, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	memberTok := loginResp.Token

	rec = doReq(t, h, http.MethodGet, "/api/users", nil, memberTok)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("member GET /api/users expected 403, got %d", rec.Code)
	}

	// 4. Create category, normal location, freezer location
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Dairy"}, adminTok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create category failed: %d %s", rec.Code, rec.Body.String())
	}
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Fridge", "is_freezer": false}, adminTok)
	var fridgeResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &fridgeResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Chest Freezer", "is_freezer": true}, adminTok)
	var freezerResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &freezerResp)

	// 5. Configure printer + custom label template override + test reset
	rec = doReq(t, h, http.MethodPost, "/api/printers", map[string]any{
		"name": "Zebra ZSB", "driver": "ipp_zpl", "endpoint": "http://192.168.1.50:631/ipp/print", "enabled": true,
	}, adminTok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create printer failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, http.MethodPut, "/api/label-templates/item", map[string]any{
		"content": "^XA^FDITEM:{{.Payload.ProductName}}|{{.Payload.Barcode}}^FS^XZ",
	}, adminTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("upsert template failed: %d %s", rec.Code, rec.Body.String())
	}

	// 6. Purchase workflow: creates product + variant + 2 barcodes + 2 items + prints 2 labels
	rec = doReq(t, h, http.MethodPost, "/api/workflows/purchase", map[string]any{
		"new_product": map[string]any{
			"name":                       "Milk, Whole",
			"category_id":                catResp.Category.ID,
			"default_location_id":        fridgeResp.Location.ID,
			"default_due_days":           10,
			"default_due_days_on_open":   5,
			"default_due_days_on_freeze": 90,
			"minimum_value":              3,
			"label_print_mode":           "per_item",
		},
		"variant_name":            "Gallon",
		"barcode":                 "012345678905",
		"barcode_quantity":        1,
		"second_barcode":          "012345678999",
		"second_barcode_quantity": 2,
		"quantity":                2,
	}, adminTok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("purchase workflow failed: %d %s", rec.Code, rec.Body.String())
	}
	var purchResp struct {
		Product Product `json:"product"`
		Items   []Item  `json:"items"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &purchResp)
	if len(purchResp.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(purchResp.Items))
	}
	if len(drv.jobs) != 2 || !strings.Contains(drv.jobs[0], "ITEM:Milk, Whole|") || !strings.Contains(drv.jobs[0], "/go/i/1") {
		t.Fatalf("expected 2 custom item print jobs with compact /go/i/1, got %v", drv.jobs)
	}

	// Duplicate barcode on another variant returns 409 Conflict
	var vID int64
	_ = conn.QueryRow(`SELECT id FROM variants LIMIT 1`).Scan(&vID)
	rec = doReq(t, h, http.MethodPost, "/api/variants/1/barcodes", map[string]any{"barcode": "012345678905"}, adminTok)
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 for duplicate barcode, got %d", rec.Code)
	}

	// 7. FTS5 search + shopping list check (2 in stock < minimum_value 3 -> on shopping list!)
	rec = doReq(t, h, http.MethodGet, "/api/products?status=shopping_list&q=mil", nil, memberTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("list products failed: %d", rec.Code)
	}
	var listResp struct {
		Products []Product `json:"products"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &listResp)
	if len(listResp.Products) != 1 || !listResp.Products[0].OnShoppingList {
		t.Fatalf("expected Milk on shopping list via FTS search, got %+v", listResp.Products)
	}

	// 8. Seed legacy_uuid on item 1 and verify BOTH /go/i/<legacy_uuid> and /api/scan/resolve work!
	legacyUUID := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	if _, err := conn.Exec(`UPDATE items SET legacy_uuid = ? WHERE id = ?`, legacyUUID, purchResp.Items[0].ID); err != nil {
		t.Fatalf("set legacy_uuid: %v", err)
	}

	rec = doReq(t, h, http.MethodPost, "/api/scan/resolve", map[string]any{
		"input": "https://my.itemizedapp.com/go/i/" + legacyUUID,
	}, memberTok)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"kind":"item"`) {
		t.Fatalf("legacy QR resolve failed: %d %s", rec.Code, rec.Body.String())
	}

	rec = doReq(t, h, http.MethodPost, "/api/scan/resolve", map[string]any{
		"input": "https://itemized.local/go/i/1",
	}, memberTok)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"kind":"item"`) {
		t.Fatalf("integer QR resolve failed: %d %s", rec.Code, rec.Body.String())
	}

	// Browser QR redirect /go/i/<legacy_uuid>
	rec = doReq(t, h, http.MethodGet, "/go/i/"+legacyUUID, nil, memberTok)
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/products/1" {
		t.Fatalf("expected 302 -> /products/1, got %d -> %s", rec.Code, rec.Header().Get("Location"))
	}

	// 9. Consume item 1 + Already-consumed idempotency + Undo via PATCH
	rec = doReq(t, h, http.MethodPost, "/api/items/1/consume", nil, memberTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("consume failed: %d", rec.Code)
	}
	var firstConsume struct {
		AlreadyConsumed bool `json:"already_consumed"`
		Item            Item `json:"item"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &firstConsume)
	if firstConsume.AlreadyConsumed || firstConsume.Item.ConsumedOnDate == nil {
		t.Fatalf("expected initial consume already_consumed=false with date set, got %+v", firstConsume)
	}
	// Backdate consumed_on_date, then re-consume and verify original date is preserved with already_consumed=true
	rec = doReq(t, h, http.MethodPatch, "/api/items/1", map[string]any{"consumed_on_date": "2026-10-01"}, memberTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("backdate consume failed: %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodPost, "/api/items/1/consume", nil, memberTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("re-consume failed: %d", rec.Code)
	}
	var repeatConsume struct {
		AlreadyConsumed bool `json:"already_consumed"`
		Item            Item `json:"item"`
		Previous        Item `json:"previous"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &repeatConsume)
	if !repeatConsume.AlreadyConsumed || repeatConsume.Item.ConsumedOnDate == nil || *repeatConsume.Item.ConsumedOnDate != "2026-10-01" {
		t.Fatalf("expected already_consumed=true preserving 2026-10-01, got %+v", repeatConsume)
	}
	// Consumed QR redirect includes notice
	rec = doReq(t, h, http.MethodGet, "/go/i/1", nil, memberTok)
	if rec.Code != http.StatusFound || !strings.Contains(rec.Header().Get("Location"), "notice=item_already_consumed") {
		t.Fatalf("expected consumed notice redirect, got %d -> %s", rec.Code, rec.Header().Get("Location"))
	}
	// Undo consume
	rec = doReq(t, h, http.MethodPatch, "/api/items/1", map[string]any{"consumed_on_date": nil}, memberTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("undo consume failed: %d", rec.Code)
	}

	// 10. Transfer item 1 to freezer -> applies default_due_days_on_freeze (90)
	rec = doReq(t, h, http.MethodPost, "/api/items/1/transfer", map[string]any{"location_id": freezerResp.Location.ID}, memberTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("transfer to freezer failed: %d %s", rec.Code, rec.Body.String())
	}

	// 11. Inventory Audit summary + apply on Fridge (item 2 is there; scan nothing -> proposes consuming item 2)
	rec = doReq(t, h, http.MethodPost, "/api/workflows/inventory/summary", map[string]any{
		"location_id":      fridgeResp.Location.ID,
		"scanned_item_ids": []int64{},
	}, memberTok)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"to_consume"`) {
		t.Fatalf("inventory summary failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, http.MethodPost, "/api/workflows/inventory/apply", map[string]any{
		"location_id":      fridgeResp.Location.ID,
		"consume_item_ids": []int64{purchResp.Items[1].ID},
	}, memberTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("inventory apply failed: %d %s", rec.Code, rec.Body.String())
	}

	// 12. Offline printer returns non-fatal warning on purchase
	drv.fail = true
	rec = doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": purchResp.Product.ID, "quantity": 1,
	}, adminTok)
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), "printer offline") {
		t.Fatalf("expected 201 with non-fatal print_warnings, got %d %s", rec.Code, rec.Body.String())
	}

	// 13. Reset label template restores default
	rec = doReq(t, h, http.MethodDelete, "/api/label-templates/item", nil, adminTok)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "^BQN,2,5") {
		t.Fatalf("reset template failed: %d %s", rec.Code, rec.Body.String())
	}

	// 14. LLM classify when unconfigured returns enabled:false gracefully
	rec = doReq(t, h, http.MethodPost, "/api/upc/classify", map[string]any{"title": "Milk"}, adminTok)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"enabled":false`) {
		t.Fatalf("unconfigured classify failed: %d %s", rec.Code, rec.Body.String())
	}
}

func TestShoppingListClearedOnPurchase(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	// Setup admin + bearer token
	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Pantry"}, tok)
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Shelf"}, tok)
	var locResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)

	// Scenario 1: Manually added product with no minimum_value leaves shopping list on purchase
	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Pasta", "category_id": catResp.Category.ID, "default_location_id": locResp.Location.ID,
		"manually_added_to_shopping_list": true, "label_print_mode": "none",
	}, tok)
	var prod1 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &prod1)
	if !prod1.Product.OnShoppingList || !prod1.Product.ManuallyAddedToShoppingList {
		t.Fatalf("expected Pasta to start manually on shopping list")
	}

	rec = doReq(t, h, http.MethodPost, "/api/workflows/purchase", map[string]any{
		"product_id": prod1.Product.ID, "quantity": 1, "label_print_mode": "none",
	}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("purchase Pasta failed: %d %s", rec.Code, rec.Body.String())
	}
	var purch1 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &purch1)
	if purch1.Product.ManuallyAddedToShoppingList || purch1.Product.OnShoppingList {
		t.Fatalf("expected Pasta removed from shopping list after purchase, got manual=%v on_list=%v",
			purch1.Product.ManuallyAddedToShoppingList, purch1.Product.OnShoppingList)
	}

	// Scenario 2 & 3: Manually added product with minimum_value=3
	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Soup", "category_id": catResp.Category.ID, "default_location_id": locResp.Location.ID,
		"minimum_value": 3, "manually_added_to_shopping_list": true, "label_print_mode": "none",
	}, tok)
	var prod2 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &prod2)

	// Buy 2 via /api/items -> manual flag clears, but stock (2) < min (3) so still on shopping list
	rec = doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": prod2.Product.ID, "quantity": 2, "label_print_mode": "none",
	}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create items Soup failed: %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodGet, "/api/products/2", nil, tok)
	var soupAfter2 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &soupAfter2)
	if soupAfter2.Product.ManuallyAddedToShoppingList {
		t.Fatalf("expected Soup manual flag cleared after purchase")
	}
	if !soupAfter2.Product.OnShoppingList || soupAfter2.Product.InStockCount != 2 {
		t.Fatalf("expected Soup to remain on shopping list (stock 2 < min 3), got %+v", soupAfter2.Product)
	}

	// Buy 1 more via /api/workflows/purchase -> stock (3) >= min (3), leaves shopping list
	rec = doReq(t, h, http.MethodPost, "/api/workflows/purchase", map[string]any{
		"product_id": prod2.Product.ID, "quantity": 1, "label_print_mode": "none",
	}, tok)
	var soupAfter3 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &soupAfter3)
	if soupAfter3.Product.ManuallyAddedToShoppingList || soupAfter3.Product.OnShoppingList {
		t.Fatalf("expected Soup off shopping list once stock reaches 3, got manual=%v on_list=%v",
			soupAfter3.Product.ManuallyAddedToShoppingList, soupAfter3.Product.OnShoppingList)
	}
}

func TestPurchaseWorkflowVariantMeasurements(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Beverages"}, tok)
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Fridge"}, tok)
	var locResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)

	// Invalid variant measurement should be rejected with 422
	rec = doReq(t, h, http.MethodPost, "/api/workflows/purchase", map[string]any{
		"new_product": map[string]any{
			"name": "Soda, Cola", "category_id": catResp.Category.ID, "default_location_id": locResp.Location.ID, "label_print_mode": "none",
		},
		"variant_name":         "Pepsi Cola",
		"variant_volume_value": 67.63,
		"variant_volume_unit":  "bogus_unit",
		"quantity":             1,
		"label_print_mode":     "none",
	}, tok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for invalid variant unit, got %d %s", rec.Code, rec.Body.String())
	}

	// Valid product + variant measurement should persist on both
	rec = doReq(t, h, http.MethodPost, "/api/workflows/purchase", map[string]any{
		"new_product": map[string]any{
			"name": "Soda, Cola", "category_id": catResp.Category.ID, "default_location_id": locResp.Location.ID,
			"volume_value": 67.63, "volume_unit": "fl_oz", "label_print_mode": "none",
		},
		"variant_name":         "Pepsi Cola",
		"variant_volume_value": 67.63,
		"variant_volume_unit":  "fl_oz",
		"barcode":              "012000001291",
		"barcode_quantity":     1,
		"quantity":             1,
		"label_print_mode":     "none",
	}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 for valid purchase with measurements, got %d %s", rec.Code, rec.Body.String())
	}
	var purchResp struct {
		Product Product `json:"product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &purchResp)
	if purchResp.Product.VolumeValue == nil || *purchResp.Product.VolumeValue != 67.63 || purchResp.Product.VolumeUnit == nil || *purchResp.Product.VolumeUnit != "fl_oz" {
		t.Fatalf("expected product measurement 67.63 fl_oz, got %+v", purchResp.Product)
	}

	rec = doReq(t, h, http.MethodGet, "/api/products/1", nil, tok)
	var detail struct {
		Variants []Variant `json:"variants"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &detail)
	if len(detail.Variants) != 1 {
		t.Fatalf("expected 1 variant, got %d", len(detail.Variants))
	}
	v := detail.Variants[0]
	if v.Name != "Pepsi Cola" || v.VolumeValue == nil || *v.VolumeValue != 67.63 || v.VolumeUnit == nil || *v.VolumeUnit != "fl_oz" {
		t.Fatalf("expected variant Pepsi Cola with 67.63 fl_oz, got %+v", v)
	}
}

func TestNextLocationNameAndBulkUpdateVariant(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Drinks"}, tok)
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	makeLoc := func(name string) int64 {
		r := doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": name}, tok)
		var lr struct{ Location Location }
		_ = json.Unmarshal(r.Body.Bytes(), &lr)
		return lr.Location.ID
	}
	pantryID := makeLoc("Pantry")
	kitchenID := makeLoc("Kitchen")
	garageID := makeLoc("Garage")
	fridgeID := makeLoc("Fridge")

	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Soda, Cola", "category_id": catResp.Category.ID, "default_location_id": pantryID, "label_print_mode": "none",
	}, tok)
	var prodResp struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &prodResp)
	if prodResp.Product.NextLocationName != "" {
		t.Fatalf("expected empty next_location_name when out of stock, got %q", prodResp.Product.NextLocationName)
	}

	// Create two variants
	rec = doReq(t, h, http.MethodPost, "/api/products/1/variants", map[string]any{"name": "Pepsi"}, tok)
	var v1 struct{ Variant Variant }
	_ = json.Unmarshal(rec.Body.Bytes(), &v1)
	rec = doReq(t, h, http.MethodPost, "/api/products/1/variants", map[string]any{"name": "Coke"}, tok)
	var v2 struct{ Variant Variant }
	_ = json.Unmarshal(rec.Body.Bytes(), &v2)

	// Add two items with no due date: first in Kitchen, second in Garage -> tie breaks to Kitchen (first entered)
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": 1, "location_id": kitchenID, "variant_id": v1.Variant.ID, "quantity": 1, "label_print_mode": "none",
	}, tok)
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": 1, "location_id": garageID, "variant_id": v1.Variant.ID, "quantity": 1, "label_print_mode": "none",
	}, tok)

	rec = doReq(t, h, http.MethodGet, "/api/products/1", nil, tok)
	var d1 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &d1)
	if d1.Product.NextLocationName != "Kitchen" {
		t.Fatalf("expected tie-broken next_location_name=Kitchen, got %q", d1.Product.NextLocationName)
	}

	// Add third item in Fridge with a due date -> soonest due wins over unset due dates
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": 1, "location_id": fridgeID, "due_on_date": "2026-12-05", "quantity": 1, "label_print_mode": "none",
	}, tok)
	rec = doReq(t, h, http.MethodGet, "/api/products?status=in_stock", nil, tok)
	var listResp struct{ Products []Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &listResp)
	if len(listResp.Products) != 1 || listResp.Products[0].NextLocationName != "Fridge" {
		t.Fatalf("expected list next_location_name=Fridge, got %+v", listResp.Products)
	}

	// Bulk update_variant to v2 on items 1 and 2
	rec = doReq(t, h, http.MethodPost, "/api/items/bulk", map[string]any{
		"action": "update_variant", "item_ids": []int64{1, 2}, "variant_id": v2.Variant.ID,
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("bulk update_variant failed: %d %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, http.MethodGet, "/api/products/1", nil, tok)
	var d2 struct{ Items []Item }
	_ = json.Unmarshal(rec.Body.Bytes(), &d2)
	for _, it := range d2.Items {
		if (it.ID == 1 || it.ID == 2) && (it.VariantID == nil || *it.VariantID != v2.Variant.ID) {
			t.Fatalf("expected item #%d updated to variant %d, got %+v", it.ID, v2.Variant.ID, it)
		}
	}
}

func TestCalculatedRollingAverageDueDays(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Dairy"}, tok)
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Fridge"}, tok)
	var locResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)

	// Product with rolling average enabled and no purchases -> calculated_due_days is nil
	doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Milk", "category_id": catResp.Category.ID, "default_location_id": locResp.Location.ID,
		"use_average_for_due_date": true, "label_print_mode": "none",
	}, tok)
	rec = doReq(t, h, http.MethodGet, "/api/products/1", nil, tok)
	var d0 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &d0)
	if d0.Product.CalculatedDueDays != nil {
		t.Fatalf("expected nil calculated_due_days with no history, got %v", *d0.Product.CalculatedDueDays)
	}

	// Add 3 purchases with offsets 10, 12, 8 -> average = 10
	purchases := [][2]string{
		{"2026-10-01", "2026-10-11"}, // 10 days
		{"2026-10-15", "2026-10-27"}, // 12 days
		{"2026-11-01", "2026-11-09"}, // 8 days
	}
	for _, p := range purchases {
		doReq(t, h, http.MethodPost, "/api/items", map[string]any{
			"product_id": 1, "purchased_on_date": p[0], "due_on_date": p[1], "quantity": 1, "label_print_mode": "none",
		}, tok)
	}
	rec = doReq(t, h, http.MethodGet, "/api/products/1", nil, tok)
	var d1 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &d1)
	if d1.Product.CalculatedDueDays == nil || *d1.Product.CalculatedDueDays != 10 {
		t.Fatalf("expected calculated_due_days=10, got %+v", d1.Product.CalculatedDueDays)
	}

	// Add 4th purchase with offset 20 -> last 3 are 12, 8, 20 -> round(40/3) = 13
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": 1, "purchased_on_date": "2026-11-15", "due_on_date": "2026-12-05", "quantity": 1, "label_print_mode": "none",
	}, tok)
	rec = doReq(t, h, http.MethodGet, "/api/products/1", nil, tok)
	var d2 struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &d2)
	if d2.Product.CalculatedDueDays == nil || *d2.Product.CalculatedDueDays != 13 {
		t.Fatalf("expected calculated_due_days=13, got %+v", d2.Product.CalculatedDueDays)
	}
}

func TestAutoReprintOnDueDateChangeAndInventoryAudit(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	fake := &fakeDriver{}
	srv.Printer.RegisterDriver(printer.DriverRawTCPZPL, fake)
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	// Configure an enabled raw TCP printer
	doReq(t, h, http.MethodPost, "/api/printers", map[string]any{
		"name": "Test Zebra", "driver": "raw_tcp_zpl", "endpoint": "127.0.0.1:9100", "enabled": true,
	}, tok)

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Meat"}, tok)
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Fridge", "is_freezer": false}, tok)
	var fridgeResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &fridgeResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Freezer", "is_freezer": true}, tok)
	var freezerResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &freezerResp)

	// Product 1: per_item with open=5, freeze=90, thaw=3
	doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Chicken", "category_id": catResp.Category.ID, "default_location_id": fridgeResp.Location.ID,
		"default_due_days": 30, "default_due_days_on_open": 5, "default_due_days_on_freeze": 90, "default_due_days_on_thaw": 3,
		"label_print_mode": "per_item",
	}, tok)
	// Create item 1 with label_print_mode="none" override so initial print count is 0
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": 1, "quantity": 1, "label_print_mode": "none",
	}, tok)

	// Open item 1 -> due date shortens from +30d to +5d -> triggers 1 print
	doReq(t, h, http.MethodPost, "/api/items/1/open", nil, tok)
	if len(fake.jobs) != 1 {
		t.Fatalf("expected 1 print after Open shortened due date, got %d", len(fake.jobs))
	}

	// Open item 1 again -> due date unchanged -> still 1 print
	doReq(t, h, http.MethodPost, "/api/items/1/open", nil, tok)
	if len(fake.jobs) != 1 {
		t.Fatalf("expected no reprint when due date unchanged on Open, got %d", len(fake.jobs))
	}

	// Transfer item 1 into Freezer -> due date changes to +90d -> triggers print #2
	doReq(t, h, http.MethodPost, "/api/items/1/transfer", map[string]any{"location_id": freezerResp.Location.ID}, tok)
	if len(fake.jobs) != 2 {
		t.Fatalf("expected 2 prints after Freeze transfer, got %d", len(fake.jobs))
	}

	// Transfer item 1 back to Fridge (Thaw) -> due date changes to +3d -> triggers print #3
	doReq(t, h, http.MethodPost, "/api/items/1/transfer", map[string]any{"location_id": fridgeResp.Location.ID}, tok)
	if len(fake.jobs) != 3 {
		t.Fatalf("expected 3 prints after Thaw transfer, got %d", len(fake.jobs))
	}

	// Inventory Audit transfer into Freezer -> updates due date to +90d and triggers print #4
	doReq(t, h, http.MethodPost, "/api/workflows/inventory/apply", map[string]any{
		"location_id":       freezerResp.Location.ID,
		"transfer_item_ids": []int64{1},
	}, tok)
	if len(fake.jobs) != 4 {
		t.Fatalf("expected 4 prints after Inventory Audit freeze transfer, got %d", len(fake.jobs))
	}

	// Product 2: single mode -> Open should NOT trigger a print
	doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Milk", "category_id": catResp.Category.ID, "default_location_id": fridgeResp.Location.ID,
		"default_due_days": 30, "default_due_days_on_open": 5, "label_print_mode": "single",
	}, tok)
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": 2, "quantity": 1, "label_print_mode": "none",
	}, tok)
	doReq(t, h, http.MethodPost, "/api/items/2/open", nil, tok)
	if len(fake.jobs) != 4 {
		t.Fatalf("expected no print for label_print_mode=single, got %d", len(fake.jobs))
	}
}

func TestSecurityAdminOnlyEndpointsAndMemberPrinting(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	fake := &fakeDriver{}
	srv.Printer.RegisterDriver(printer.DriverIPPZPL, fake)
	h := srv.Handler()

	// Setup admin + create member
	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	adminTok := loginResp.Token

	doReq(t, h, http.MethodPost, "/api/users", map[string]any{"email": "member@home.local", "password": "password123", "role": "member"}, adminTok)
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "member@home.local", "password": "password123", "mode": "bearer"}, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	memberTok := loginResp.Token

	// Admin creates printer, category, location, product
	rec = doReq(t, h, http.MethodPost, "/api/printers", map[string]any{
		"name": "Zebra", "driver": "ipp_zpl", "endpoint": "http://192.168.1.50:631/ipp/print", "enabled": true,
	}, adminTok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("admin create printer expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var prResp struct{ Printer PrinterRecord }
	_ = json.Unmarshal(rec.Body.Bytes(), &prResp)

	// Member must get 403 on settings, printers, and label templates
	forbiddenChecks := []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodGet, "/api/settings", nil},
		{http.MethodPatch, "/api/settings", map[string]any{"base_url": "https://evil.example"}},
		{http.MethodGet, "/api/printers", nil},
		{http.MethodPost, "/api/printers", map[string]any{"name": "Rogue", "driver": "ipp_zpl", "endpoint": "http://127.0.0.1:9999"}},
		{http.MethodPatch, "/api/printers/1", map[string]any{"name": "X", "driver": "ipp_zpl", "endpoint": "http://127.0.0.1:9999", "enabled": true}},
		{http.MethodDelete, "/api/printers/1", nil},
		{http.MethodPost, "/api/printers/1/test", nil},
		{http.MethodGet, "/api/label-templates", nil},
		{http.MethodPut, "/api/label-templates/item", map[string]any{"content": "^XA^XZ"}},
		{http.MethodDelete, "/api/label-templates/item", nil},
	}
	for _, tc := range forbiddenChecks {
		rec := doReq(t, h, tc.method, tc.path, tc.body, memberTok)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("member %s %s expected 403, got %d: %s", tc.method, tc.path, rec.Code, rec.Body.String())
		}
	}

	// Admin succeeds on settings, printer test, and label templates
	if rec := doReq(t, h, http.MethodGet, "/api/settings", nil, adminTok); rec.Code != http.StatusOK {
		t.Fatalf("admin GET /api/settings expected 200, got %d", rec.Code)
	}
	if rec := doReq(t, h, http.MethodPost, "/api/printers/1/test", nil, adminTok); rec.Code != http.StatusOK {
		t.Fatalf("admin test printer expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Member can still trigger normal inventory label printing
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Pantry"}, memberTok)
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Shelf"}, memberTok)
	var locResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Beans", "category_id": catResp.Category.ID, "default_location_id": locResp.Location.ID, "label_print_mode": "per_item",
	}, memberTok)
	var prodResp struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &prodResp)

	jobsBefore := len(fake.jobs)
	rec = doReq(t, h, http.MethodPost, "/api/items", map[string]any{"product_id": prodResp.Product.ID, "quantity": 1}, memberTok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("member create item expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(fake.jobs) != jobsBefore+1 {
		t.Fatalf("expected member item creation to trigger label print, jobs before=%d after=%d", jobsBefore, len(fake.jobs))
	}
}

func TestSecuritySessionRevocationAndLoginRateLimiting(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	srv.LoginLimiter = newLoginRateLimiter(3, 60*1e9) // 3 per minute for test
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	adminTok1 := loginResp.Token

	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	adminTok2 := loginResp.Token

	// Change password via adminTok1 -> adminTok2 is revoked, adminTok1 remains valid
	rec = doReq(t, h, http.MethodPatch, "/api/auth/account", map[string]any{
		"current_password": "password123", "new_password": "newpassword456",
	}, adminTok1)
	if rec.Code != http.StatusOK {
		t.Fatalf("account password change expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := doReq(t, h, http.MethodGet, "/api/auth/me", nil, adminTok1); rec.Code != http.StatusOK {
		t.Fatalf("expected current session adminTok1 valid, got %d", rec.Code)
	}
	if rec := doReq(t, h, http.MethodGet, "/api/auth/me", nil, adminTok2); rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected other session adminTok2 revoked (401), got %d", rec.Code)
	}

	// Create member, log in, then admin resets member's password -> member token revoked
	rec = doReq(t, h, http.MethodPost, "/api/users", map[string]any{"email": "m@home.local", "password": "password123", "role": "member"}, adminTok1)
	var userResp struct {
		User struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &userResp)

	// Fresh limiter for rate-limit subtests
	srv.LoginLimiter = newLoginRateLimiter(2, 60*1e9)
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "m@home.local", "password": "password123", "mode": "bearer"}, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	memberTok := loginResp.Token

	if rec := doReq(t, h, http.MethodPost, "/api/users/2/reset-password", map[string]any{"password": "resetpass789"}, adminTok1); rec.Code != http.StatusOK {
		t.Fatalf("reset password expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := doReq(t, h, http.MethodGet, "/api/auth/me", nil, memberTok); rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected member token revoked after reset, got %d", rec.Code)
	}

	// Rate limiting: TrustProxy=false ignores spoofed X-Forwarded-For
	srv.TrustProxy = false
	srv.LoginLimiter = newLoginRateLimiter(2, 60*1e9)
	sendLogin := func(remoteAddr, xff, email string) int {
		body, _ := json.Marshal(map[string]any{"email": email, "password": "wrong"})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
		req.RemoteAddr = remoteAddr
		if xff != "" {
			req.Header.Set("X-Forwarded-For", xff)
		}
		r := httptest.NewRecorder()
		h.ServeHTTP(r, req)
		return r.Code
	}
	if code := sendLogin("203.0.113.10:1234", "198.51.100.1", "a@home.local"); code != http.StatusUnauthorized {
		t.Fatalf("attempt 1 expected 401, got %d", code)
	}
	if code := sendLogin("203.0.113.10:1234", "198.51.100.2", "b@home.local"); code != http.StatusUnauthorized {
		t.Fatalf("attempt 2 expected 401, got %d", code)
	}
	if code := sendLogin("203.0.113.10:1234", "198.51.100.3", "c@home.local"); code != http.StatusTooManyRequests {
		t.Fatalf("attempt 3 with spoofed XFF expected 429, got %d", code)
	}

	// Rate limiting: TrustProxy=true uses rightmost non-private IP in X-Forwarded-For
	srv.TrustProxy = true
	srv.LoginLimiter = newLoginRateLimiter(2, 60*1e9)
	// Same proxy RemoteAddr (10.0.0.2), different real client IPs -> distinct IP buckets
	if code := sendLogin("10.0.0.2:443", "198.51.100.10", "u1@home.local"); code != http.StatusUnauthorized {
		t.Fatalf("proxy client 1 expected 401, got %d", code)
	}
	if code := sendLogin("10.0.0.2:443", "198.51.100.11", "u2@home.local"); code != http.StatusUnauthorized {
		t.Fatalf("proxy client 2 expected 401, got %d", code)
	}
	if code := sendLogin("10.0.0.2:443", "198.51.100.12", "u3@home.local"); code != http.StatusUnauthorized {
		t.Fatalf("proxy client 3 expected 401 (distinct XFF), got %d", code)
	}
	// Same email across different IPs -> throttled by email bucket on 3rd attempt
	if code := sendLogin("10.0.0.2:443", "198.51.100.20", "victim@home.local"); code != http.StatusUnauthorized {
		t.Fatalf("email attempt 1 expected 401, got %d", code)
	}
	if code := sendLogin("10.0.0.2:443", "198.51.100.21", "victim@home.local"); code != http.StatusUnauthorized {
		t.Fatalf("email attempt 2 expected 401, got %d", code)
	}
	if code := sendLogin("10.0.0.2:443", "198.51.100.22", "victim@home.local"); code != http.StatusTooManyRequests {
		t.Fatalf("email attempt 3 expected 429, got %d", code)
	}
}

func TestSecurityBodyLimitAndQuantityCaps(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	// Oversized JSON body (>1 MiB) -> 413
	huge := `{"name":"` + strings.Repeat("a", maxJSONBodyBytes+1024) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/categories", strings.NewReader(huge))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tok)
	bigRec := httptest.NewRecorder()
	h.ServeHTTP(bigRec, req)
	if bigRec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized JSON expected 413, got %d: %s", bigRec.Code, bigRec.Body.String())
	}

	// Quantity > 500 rejected with 422 on items, purchase, and inventory apply
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Food"}, tok)
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Pantry"}, tok)
	var locResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Rice", "category_id": catResp.Category.ID, "default_location_id": locResp.Location.ID,
	}, tok)
	var prodResp struct{ Product Product }
	_ = json.Unmarshal(rec.Body.Bytes(), &prodResp)

	if rec := doReq(t, h, http.MethodPost, "/api/items", map[string]any{"product_id": prodResp.Product.ID, "quantity": 501}, tok); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("POST /api/items quantity=501 expected 422, got %d", rec.Code)
	}
	if rec := doReq(t, h, http.MethodPost, "/api/workflows/purchase", map[string]any{"product_id": prodResp.Product.ID, "quantity": 501}, tok); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("POST /api/workflows/purchase quantity=501 expected 422, got %d", rec.Code)
	}
	if rec := doReq(t, h, http.MethodPost, "/api/workflows/inventory/apply", map[string]any{
		"location_id": locResp.Location.ID,
		"create_items": []map[string]any{
			{"product_id": prodResp.Product.ID, "quantity": 501},
		},
	}, tok); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("POST /api/workflows/inventory/apply quantity=501 expected 422, got %d", rec.Code)
	}
}

func TestSPAServesWasmContentType(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	staticFS := fstest.MapFS{
		"index.html":               {Data: []byte("<!doctype html><html></html>")},
		"assets/zxing_reader.wasm": {Data: []byte{0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00}},
	}
	srv := NewServer(conn, staticFS)
	h := srv.Handler()

	req := httptest.NewRequest(http.MethodGet, "/assets/zxing_reader.wasm", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for wasm asset, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/wasm") {
		t.Fatalf("expected Content-Type application/wasm, got %q", ct)
	}
}

func TestRawTCPPrinterEndpointNormalizationAndTestPrint(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	// POST normalizes URL-formatted raw_tcp_zpl endpoint
	rec = doReq(t, h, http.MethodPost, "/api/printers", map[string]any{
		"name": "Zebra Raw", "driver": "raw_tcp_zpl", "endpoint": "http://192.168.1.102:9100", "enabled": true,
	}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("POST /api/printers expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var createResp struct{ Printer PrinterRecord }
	_ = json.Unmarshal(rec.Body.Bytes(), &createResp)
	if createResp.Printer.Endpoint != "192.168.1.102:9100" {
		t.Fatalf("expected normalized endpoint 192.168.1.102:9100, got %q", createResp.Printer.Endpoint)
	}

	// PATCH normalizes bare host to :9100
	rec = doReq(t, h, http.MethodPatch, "/api/printers/1", map[string]any{
		"name": "Zebra Raw", "driver": "raw_tcp_zpl", "endpoint": "http://192.168.1.105", "enabled": true,
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("PATCH /api/printers/1 expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var storedEndpoint string
	if err := conn.QueryRow(`SELECT endpoint FROM printers WHERE id = 1`).Scan(&storedEndpoint); err != nil {
		t.Fatalf("query stored endpoint: %v", err)
	}
	if storedEndpoint != "192.168.1.105:9100" {
		t.Fatalf("expected updated normalized endpoint 192.168.1.105:9100, got %q", storedEndpoint)
	}

	// POST and PATCH reject invalid raw_tcp_zpl endpoints with 422
	for _, bad := range []string{"http://", "192.168.1.102:99999", "192.168.1.102:abc"} {
		rec = doReq(t, h, http.MethodPost, "/api/printers", map[string]any{
			"name": "Bad", "driver": "raw_tcp_zpl", "endpoint": bad, "enabled": true,
		}, tok)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("POST invalid endpoint %q expected 422, got %d: %s", bad, rec.Code, rec.Body.String())
		}
		rec = doReq(t, h, http.MethodPatch, "/api/printers/1", map[string]any{
			"name": "Bad", "driver": "raw_tcp_zpl", "endpoint": bad, "enabled": true,
		}, tok)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("PATCH invalid endpoint %q expected 422, got %d: %s", bad, rec.Code, rec.Body.String())
		}
	}

	// Existing legacy DB row with http://<host>:<port> succeeds on POST /api/printers/{id}/test
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen tcp: %v", err)
	}
	defer ln.Close()
	received := make(chan string, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		b, _ := io.ReadAll(c)
		received <- string(b)
	}()

	now := db.NowUTC()
	_, err = conn.Exec(`INSERT INTO printers (name, driver, endpoint, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
		"Legacy Raw", "raw_tcp_zpl", "http://"+ln.Addr().String(), now, now)
	if err != nil {
		t.Fatalf("insert legacy printer: %v", err)
	}
	rec = doReq(t, h, http.MethodPost, "/api/printers/2/test", nil, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/printers/2/test expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if zpl := <-received; !strings.Contains(zpl, "^XA") {
		t.Fatalf("expected ZPL payload over raw TCP, got %q", zpl)
	}
}

func TestAdminUserRoleManagement(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	// Setup initial admin
	rec := doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{
		"email": "admin@home.local", "password": "password123",
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("setup expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	// Login as admin
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123", "mode": "bearer",
	}, "")
	var loginResp struct {
		Token string `json:"token"`
		User  struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	adminTok := loginResp.Token
	adminID := loginResp.User.ID

	// Create a member
	rec = doReq(t, h, http.MethodPost, "/api/users", map[string]any{
		"email": "member@home.local", "password": "password123", "role": "member",
	}, adminTok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create member expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var createResp struct {
		User struct {
			ID   int64  `json:"id"`
			Role string `json:"role"`
		} `json:"user"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &createResp)
	memberID := createResp.User.ID

	// Login as member
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "member@home.local", "password": "password123", "mode": "bearer",
	}, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	memberTok := loginResp.Token

	// Member cannot update user roles -> 403
	rec = doReq(t, h, http.MethodPatch, "/api/users/"+strconv.FormatInt(adminID, 10), map[string]any{
		"role": "member",
	}, memberTok)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("member PATCH /api/users expected 403, got %d", rec.Code)
	}

	// Admin cannot change own role -> 422
	rec = doReq(t, h, http.MethodPatch, "/api/users/"+strconv.FormatInt(adminID, 10), map[string]any{
		"role": "member",
	}, adminTok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("self role change expected 422, got %d: %s", rec.Code, rec.Body.String())
	}

	// Admin promotes member to admin -> 200
	rec = doReq(t, h, http.MethodPatch, "/api/users/"+strconv.FormatInt(memberID, 10), map[string]any{
		"role": "admin",
	}, adminTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("promote member expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &createResp)
	if createResp.User.Role != "admin" {
		t.Fatalf("expected role admin, got %q", createResp.User.Role)
	}

	// Admin demotes other admin back to member -> 200
	rec = doReq(t, h, http.MethodPatch, "/api/users/"+strconv.FormatInt(memberID, 10), map[string]any{
		"role": "member",
	}, adminTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("demote admin expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &createResp)
	if createResp.User.Role != "member" {
		t.Fatalf("expected role member, got %q", createResp.User.Role)
	}

	// Invalid role -> 422
	rec = doReq(t, h, http.MethodPatch, "/api/users/"+strconv.FormatInt(memberID, 10), map[string]any{
		"role": "superuser",
	}, adminTok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid role expected 422, got %d", rec.Code)
	}
}

func TestForceOIDCSettingAndLoginEnforcement(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	// Setup admin and get bearer token
	rec := doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{
		"email": "admin@home.local", "password": "password123",
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("setup expected 201, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123", "mode": "bearer",
	}, "")
	var loginResp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	adminTok := loginResp.Token

	// Default status: oidc_enabled=false, oidc_force=false
	rec = doReq(t, h, http.MethodGet, "/api/auth/status", nil, "")
	var statusResp struct {
		Initialized bool `json:"initialized"`
		OIDCEnabled bool `json:"oidc_enabled"`
		OIDCForce   bool `json:"oidc_force"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &statusResp)
	if !statusResp.Initialized || statusResp.OIDCEnabled || statusResp.OIDCForce {
		t.Fatalf("unexpected initial auth status: %+v", statusResp)
	}

	// Enabling oidc_force without OIDC config fails with 422
	rec = doReq(t, h, http.MethodPatch, "/api/settings", map[string]any{
		"oidc_force": true,
	}, adminTok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("forcing OIDC without config expected 422, got %d: %s", rec.Code, rec.Body.String())
	}

	// Configure OIDC + enable oidc_force -> 200
	rec = doReq(t, h, http.MethodPatch, "/api/settings", map[string]any{
		"oidc_issuer":    "http://127.0.0.1:1/issuer",
		"oidc_client_id": "itemized-client",
		"oidc_force":     true,
	}, adminTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("enable OIDC force expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var settingsResp struct {
		OIDCForce bool `json:"oidc_force"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &settingsResp)
	if !settingsResp.OIDCForce {
		t.Fatalf("expected settings oidc_force=true")
	}

	// Auth status advertises oidc_enabled=true and oidc_force=true
	rec = doReq(t, h, http.MethodGet, "/api/auth/status", nil, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &statusResp)
	if !statusResp.OIDCEnabled || !statusResp.OIDCForce {
		t.Fatalf("expected oidc_enabled=true and oidc_force=true, got %+v", statusResp)
	}

	// Local login (cookie mode) rejected with 403
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123",
	}, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("local cookie login when forced expected 403, got %d: %s", rec.Code, rec.Body.String())
	}

	// Local login (bearer mode) rejected with 403
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123", "mode": "bearer",
	}, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("local bearer login when forced expected 403, got %d: %s", rec.Code, rec.Body.String())
	}

	// OIDC login endpoint remains enabled (not 403/404; fails discovery with 502 on unreachable issuer)
	rec = doReq(t, h, http.MethodGet, "/api/auth/oidc/login", nil, "")
	if rec.Code == http.StatusForbidden || rec.Code == http.StatusNotFound {
		t.Fatalf("expected OIDC login endpoint to remain enabled, got %d", rec.Code)
	}

	// Clearing oidc_issuer automatically resets oidc_force to false
	rec = doReq(t, h, http.MethodPatch, "/api/settings", map[string]any{
		"oidc_issuer": "",
	}, adminTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("clearing oidc_issuer expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &settingsResp)
	if settingsResp.OIDCForce {
		t.Fatalf("expected oidc_force reset to false after clearing oidc_issuer")
	}

	// Local login works again
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123", "mode": "bearer",
	}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("local login after disabling OIDC expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestTaxonomyUpdateValidation(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "admin@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "admin@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct{ Token string `json:"token"` }
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	// --- Categories: Food -> Dairy -> Cheese, plus Beverages ---
	var catResp struct{ Category Category }
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Food"}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	foodID := catResp.Category.ID

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Dairy", "parent_id": foodID}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	dairyID := catResp.Category.ID

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Cheese", "parent_id": dairyID}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	cheeseID := catResp.Category.ID

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Beverages"}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	bevID := catResp.Category.ID

	// Reject blank category name
	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/categories/%d", dairyID), map[string]any{"name": "   ", "parent_id": foodID}, tok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("blank category name expected 422, got %d: %s", rec.Code, rec.Body.String())
	}

	// Reject self-parenting
	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/categories/%d", foodID), map[string]any{"name": "Food", "parent_id": foodID}, tok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("self-parent category expected 422, got %d: %s", rec.Code, rec.Body.String())
	}

	// Reject child & grandchild cycle
	for _, descID := range []int64{dairyID, cheeseID} {
		rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/categories/%d", foodID), map[string]any{"name": "Food", "parent_id": descID}, tok)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("descendant cycle category (parent=%d) expected 422, got %d: %s", descID, rec.Code, rec.Body.String())
		}
	}

	// Rename & reparent Cheese under Beverages
	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/categories/%d", cheeseID), map[string]any{"name": "Milk Drinks", "parent_id": bevID}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("update category expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	if catResp.Category.Name != "Milk Drinks" || catResp.Category.ParentID == nil || *catResp.Category.ParentID != bevID || catResp.Category.HierarchyName != "Beverages > Milk Drinks" {
		t.Fatalf("unexpected updated category: %+v", catResp.Category)
	}

	// Promote Milk Drinks to top-level (parent_id: null)
	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/categories/%d", cheeseID), map[string]any{"name": "Milk Drinks", "parent_id": nil}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("promote category to top-level expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	if catResp.Category.ParentID != nil || catResp.Category.HierarchyName != "Milk Drinks" {
		t.Fatalf("expected top-level category, got %+v", catResp.Category)
	}

	// --- Locations: Kitchen -> Fridge -> Top Shelf, plus Garage ---
	var locResp struct{ Location Location }
	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Kitchen", "is_freezer": false}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	kitchenID := locResp.Location.ID

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Fridge", "parent_id": kitchenID, "is_freezer": false}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	fridgeID := locResp.Location.ID

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Top Shelf", "parent_id": fridgeID, "is_freezer": false}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	shelfID := locResp.Location.ID

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Garage", "is_freezer": false}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	garageID := locResp.Location.ID

	// Reject blank location name
	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/locations/%d", fridgeID), map[string]any{"name": "  ", "parent_id": kitchenID, "is_freezer": false}, tok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("blank location name expected 422, got %d: %s", rec.Code, rec.Body.String())
	}

	// Reject self-parenting and child/grandchild cycles
	for _, descID := range []int64{kitchenID, fridgeID, shelfID} {
		rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/locations/%d", kitchenID), map[string]any{"name": "Kitchen", "parent_id": descID, "is_freezer": false}, tok)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("cycle location (parent=%d) expected 422, got %d: %s", descID, rec.Code, rec.Body.String())
		}
	}

	// Rename, reparent under Garage, and enable is_freezer
	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/locations/%d", shelfID), map[string]any{"name": "Chest Freezer", "parent_id": garageID, "is_freezer": true}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("update location expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	if locResp.Location.Name != "Chest Freezer" || locResp.Location.ParentID == nil || *locResp.Location.ParentID != garageID || !locResp.Location.IsFreezer || locResp.Location.HierarchyName != "Garage > Chest Freezer" {
		t.Fatalf("unexpected updated location: %+v", locResp.Location)
	}

	// Promote to top-level and disable is_freezer
	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/locations/%d", shelfID), map[string]any{"name": "Chest Freezer", "parent_id": nil, "is_freezer": false}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("promote location to top-level expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	if locResp.Location.ParentID != nil || locResp.Location.IsFreezer || locResp.Location.HierarchyName != "Chest Freezer" {
		t.Fatalf("expected top-level non-freezer location, got %+v", locResp.Location)
	}
}

func TestFuzzyProductSearch(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{"email": "fuzzy@home.local", "password": "password123"}, "")
	rec := doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{"email": "fuzzy@home.local", "password": "password123", "mode": "bearer"}, "")
	var loginResp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	var catResp struct{ Category Category }
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Food"}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	catID := catResp.Category.ID

	var locResp struct{ Location Location }
	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Pantry"}, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)
	locID := locResp.Location.ID

	createProduct := func(name string) int64 {
		var pResp struct{ Product Product }
		r := doReq(t, h, http.MethodPost, "/api/products", map[string]any{
			"name":                name,
			"category_id":         catID,
			"default_location_id": locID,
		}, tok)
		if r.Code != http.StatusCreated {
			t.Fatalf("create product %q failed: %d %s", name, r.Code, r.Body.String())
		}
		_ = json.Unmarshal(r.Body.Bytes(), &pResp)
		return pResp.Product.ID
	}

	chickenID := createProduct("Chicken, Popcorn, Fried")
	createProduct("Soup, Chicken Noodle")
	createProduct("Nuts, Cashews, Whole")
	createProduct("Cashews")
	milkID := createProduct("Milk")
	createProduct("Milk, Whole")
	almondMilkID := createProduct("Almond Milk, Unsweetened")
	createProduct("Buttermilk")

	// Add a variant and 12-digit UPC-A barcode to Chicken, Popcorn, Fried
	var varResp struct{ Variant Variant }
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/variants", chickenID), map[string]any{"name": "Tyson"}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create variant failed: %d %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &varResp)

	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/variants/%d/barcodes", varResp.Variant.ID), map[string]any{
		"barcode":          "012345678905",
		"default_quantity": 1,
	}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create barcode failed: %d %s", rec.Code, rec.Body.String())
	}

	// Add stock & due dates to test explicit sort overrides
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id":  milkID,
		"location_id": locID,
		"due_on_date": "2026-12-20",
		"quantity":    1,
	}, tok)
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id":  almondMilkID,
		"location_id": locID,
		"due_on_date": "2026-12-05",
		"quantity":    3,
	}, tok)

	searchNames := func(q, sortParam string) []string {
		params := url.Values{}
		params.Set("status", "all")
		params.Set("q", q)
		if sortParam != "" {
			params.Set("sort", sortParam)
		}
		r := doReq(t, h, http.MethodGet, "/api/products?"+params.Encode(), nil, tok)
		if r.Code != http.StatusOK {
			t.Fatalf("search q=%q failed: %d %s", q, r.Code, r.Body.String())
		}
		var resp struct {
			Products []Product `json:"products"`
		}
		_ = json.Unmarshal(r.Body.Bytes(), &resp)
		names := make([]string, len(resp.Products))
		for i, p := range resp.Products {
			names[i] = p.Name
		}
		return names
	}

	contains := func(list []string, target string) bool {
		for _, s := range list {
			if s == target {
				return true
			}
		}
		return false
	}

	// 1. Reordered words & omitted punctuation
	if got := searchNames("Fried Chicken Popcorn", ""); !contains(got, "Chicken, Popcorn, Fried") {
		t.Fatalf("expected reordered words to match Chicken, Popcorn, Fried; got %v", got)
	}

	// 2. Extra descriptive words (LLM-classified style)
	if got := searchNames("Chicken, Popcorn, Fried, Original", ""); !contains(got, "Chicken, Popcorn, Fried") {
		t.Fatalf("expected extra descriptive words to match Chicken, Popcorn, Fried; got %v", got)
	}

	// 3. Multi-word order-independent keywords
	if got := searchNames("whole nuts", ""); !contains(got, "Nuts, Cashews, Whole") {
		t.Fatalf("expected multi-word keywords to match Nuts, Cashews, Whole; got %v", got)
	}

	// 4. Partial substring
	if got := searchNames("cash", ""); !contains(got, "Nuts, Cashews, Whole") {
		t.Fatalf("expected partial substring to match Nuts, Cashews, Whole; got %v", got)
	}

	// 5. Typo tolerance via trigram similarity (single-word and multi-word names)
	if got := searchNames("Cashewz", ""); !contains(got, "Cashews") {
		t.Fatalf("expected typo 'Cashewz' to match 'Cashews'; got %v", got)
	}
	if got := searchNames("chiken", ""); !contains(got, "Chicken, Popcorn, Fried") {
		t.Fatalf("expected typo 'chiken' to match 'Chicken, Popcorn, Fried'; got %v", got)
	}

	// 6. Tiered relevance ordering: Exact > Prefix > WholeWord > Substring
	if got := searchNames("Milk", ""); len(got) < 4 ||
		got[0] != "Milk" ||
		got[1] != "Milk, Whole" ||
		got[2] != "Almond Milk, Unsweetened" ||
		got[3] != "Buttermilk" {
		t.Fatalf("expected tiered order [Milk, Milk, Whole, Almond Milk, Unsweetened, Buttermilk], got %v", got)
	}
	if got := searchNames("chick", ""); len(got) < 2 || got[0] != "Chicken, Popcorn, Fried" {
		t.Fatalf("expected prefix match 'Chicken, Popcorn, Fried' before 'Soup, Chicken Noodle', got %v", got)
	}

	// 7. Explicit sort overrides (due_date and stock put Almond Milk first)
	if got := searchNames("Milk", "due_date"); len(got) < 2 || got[0] != "Almond Milk, Unsweetened" {
		t.Fatalf("expected sort=due_date to put Almond Milk first, got %v", got)
	}
	if got := searchNames("Milk", "stock"); len(got) < 2 || got[0] != "Almond Milk, Unsweetened" {
		t.Fatalf("expected sort=stock to put Almond Milk first, got %v", got)
	}

	// 8. Punctuation-only query returns empty
	if got := searchNames(",,,---", ""); len(got) != 0 {
		t.Fatalf("expected punctuation-only query to return empty, got %v", got)
	}

	// 9. 12-digit UPC-A and 13-digit leading-zero EAN-13 barcode queries
	for _, bc := range []string{"012345678905", "0012345678905"} {
		got := searchNames(bc, "")
		if len(got) != 1 || got[0] != "Chicken, Popcorn, Fried" {
			t.Fatalf("expected barcode query %q to return [Chicken, Popcorn, Fried], got %v", bc, got)
		}
	}
}

func TestMergeProductsAndAliasResolution(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	// Setup admin + bearer token
	rec := doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{
		"email": "admin@home.local", "password": "password123",
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("setup expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123", "mode": "bearer",
	}, "")
	var loginResp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	// Create category & location
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Pantry"}, tok)
	var catResp struct {
		Category Category `json:"category"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Shelf"}, tok)
	var locResp struct {
		Location Location `json:"location"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)

	createProduct := func(name string) Product {
		rec := doReq(t, h, http.MethodPost, "/api/products", map[string]any{
			"name":                name,
			"category_id":         catResp.Category.ID,
			"default_location_id": locResp.Location.ID,
		}, tok)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create product %q expected 201, got %d: %s", name, rec.Code, rec.Body.String())
		}
		var resp struct {
			Product Product `json:"product"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &resp)
		return resp.Product
	}

	prodA := createProduct("Olive Oil, Extra Virgin")
	prodB := createProduct("EVOO")
	prodC := createProduct("Extra Virgin Olive Oil")

	legacyUUIDB := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1"
	legacyUUIDC := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2"
	if _, err := conn.Exec(`UPDATE products SET legacy_uuid = ? WHERE id = ?`, legacyUUIDB, prodB.ID); err != nil {
		t.Fatalf("set legacy_uuid B: %v", err)
	}
	if _, err := conn.Exec(`UPDATE products SET legacy_uuid = ? WHERE id = ?`, legacyUUIDC, prodC.ID); err != nil {
		t.Fatalf("set legacy_uuid C: %v", err)
	}

	// Add variants, retail barcodes, and items (both unconsumed and consumed) to prodB and prodC
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/variants", prodB.ID), map[string]any{"name": "500ml Bottle"}, tok)
	var varBResp struct {
		Variant Variant `json:"variant"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &varBResp)
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/variants/%d/barcodes", varBResp.Variant.ID), map[string]any{
		"barcode": "012345678905", "default_quantity": 1,
	}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create barcode expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	rec = doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": prodB.ID, "variant_id": varBResp.Variant.ID, "location_id": locResp.Location.ID, "quantity": 2,
	}, tok)
	var itemsBResp struct {
		Items []Item `json:"items"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &itemsBResp)
	// Consume one of prodB's items to verify consumed history also moves
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/items/%d/consume", itemsBResp.Items[0].ID), nil, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("consume item expected 200, got %d", rec.Code)
	}

	rec = doReq(t, h, http.MethodPost, "/api/items", map[string]any{
		"product_id": prodC.ID, "location_id": locResp.Location.ID, "quantity": 1,
	}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create item C expected 201, got %d", rec.Code)
	}

	// Validation error cases
	rec = doReq(t, h, http.MethodPost, "/api/products/merge", map[string]any{
		"target_product_id": prodA.ID, "source_product_ids": []int64{},
	}, tok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("empty sources expected 422, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodPost, "/api/products/merge", map[string]any{
		"target_product_id": prodA.ID, "source_product_ids": []int64{prodA.ID, prodB.ID},
	}, tok)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("self-merge expected 422, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodPost, "/api/products/merge", map[string]any{
		"target_product_id": 99999, "source_product_ids": []int64{prodB.ID},
	}, tok)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("missing target expected 404, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodPost, "/api/products/merge", map[string]any{
		"target_product_id": prodA.ID, "source_product_ids": []int64{prodB.ID, 99999},
	}, tok)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("missing source expected 404, got %d", rec.Code)
	}

	// Merge prodB and prodC into prodA
	highestMergedID := prodC.ID
	rec = doReq(t, h, http.MethodPost, "/api/products/merge", map[string]any{
		"target_product_id":  prodA.ID,
		"source_product_ids": []int64{prodB.ID, prodC.ID},
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("merge expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var mergeResp struct {
		Product     Product `json:"product"`
		MergedCount int     `json:"merged_count"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &mergeResp)
	if mergeResp.Product.ID != prodA.ID || mergeResp.MergedCount != 2 {
		t.Fatalf("unexpected merge response: %+v", mergeResp)
	}
	if mergeResp.Product.InStockCount != 2 {
		t.Fatalf("expected 2 in-stock items after merge (1 unconsumed from B + 1 from C), got %d", mergeResp.Product.InStockCount)
	}

	// Source products are deleted
	rec = doReq(t, h, http.MethodGet, fmt.Sprintf("/api/products/%d", prodB.ID), nil, tok)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("merged source B expected 404 on GET /api/products/:id, got %d", rec.Code)
	}

	// Target product has all variants + all items (including consumed)
	rec = doReq(t, h, http.MethodGet, fmt.Sprintf("/api/products/%d?include_consumed=true", prodA.ID), nil, tok)
	var detailResp struct {
		Product  Product   `json:"product"`
		Variants []Variant `json:"variants"`
		Items    []Item    `json:"items"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &detailResp)
	if len(detailResp.Variants) != 1 || detailResp.Variants[0].ID != varBResp.Variant.ID {
		t.Fatalf("expected variant from B on A, got %+v", detailResp.Variants)
	}
	if len(detailResp.Items) != 3 {
		t.Fatalf("expected 3 total items (2 unconsumed + 1 consumed) on A, got %d", len(detailResp.Items))
	}

	// Newly created product must NOT reuse highestMergedID
	prodD := createProduct("Olive Oil, Cooking")
	if prodD.ID <= highestMergedID {
		t.Fatalf("expected new product ID > %d (merged highest ID), got %d", highestMergedID, prodD.ID)
	}

	// GET /go/p/<merged-id> and /go/p/<merged-legacy-uuid> redirect to prodA
	for _, token := range []string{strconv.FormatInt(prodB.ID, 10), legacyUUIDB, strings.ToUpper(legacyUUIDC)} {
		rec := doReq(t, h, http.MethodGet, "/go/p/"+token, nil, tok)
		if rec.Code != http.StatusFound {
			t.Fatalf("GET /go/p/%s expected 302, got %d", token, rec.Code)
		}
		wantLoc := fmt.Sprintf("/products/%d", prodA.ID)
		if gotLoc := rec.Header().Get("Location"); gotLoc != wantLoc {
			t.Fatalf("GET /go/p/%s expected redirect %q, got %q", token, wantLoc, gotLoc)
		}
	}

	// POST /api/scan/resolve resolves merged product QR URLs, bare legacy UUID, and moved retail barcode
	for _, scanInput := range []string{
		fmt.Sprintf("https://itemized.local/go/p/%d", prodB.ID),
		fmt.Sprintf("https://old.itemizedapp.com/go/p/%s", legacyUUIDB),
		legacyUUIDC,
	} {
		rec := doReq(t, h, http.MethodPost, "/api/scan/resolve", map[string]any{"input": scanInput}, tok)
		if rec.Code != http.StatusOK {
			t.Fatalf("scan resolve %q expected 200, got %d", scanInput, rec.Code)
		}
		var scanResp struct {
			Kind    string  `json:"kind"`
			Product Product `json:"product"`
			Items   []Item  `json:"items"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &scanResp)
		if scanResp.Kind != "product" || scanResp.Product.ID != prodA.ID || len(scanResp.Items) != 2 {
			t.Fatalf("scan resolve %q expected kind=product id=%d items=2, got %+v", scanInput, prodA.ID, scanResp)
		}
	}

	// Retail barcode from moved variant resolves to prodA
	rec = doReq(t, h, http.MethodPost, "/api/scan/resolve", map[string]any{"input": "012345678905"}, tok)
	var bcScanResp struct {
		Kind    string  `json:"kind"`
		Product Product `json:"product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &bcScanResp)
	if bcScanResp.Kind != "barcode" || bcScanResp.Product.ID != prodA.ID {
		t.Fatalf("moved retail barcode expected kind=barcode product=%d, got %+v", prodA.ID, bcScanResp)
	}

	// Chained merge: merge prodA into prodD -> aliases from prodB and prodC must now resolve to prodD
	rec = doReq(t, h, http.MethodPost, "/api/products/merge", map[string]any{
		"target_product_id":  prodD.ID,
		"source_product_ids": []int64{prodA.ID},
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("chained merge expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	for _, scanInput := range []string{
		fmt.Sprintf("https://itemized.local/go/p/%d", prodB.ID),
		fmt.Sprintf("https://itemized.local/go/p/%d", prodA.ID),
		legacyUUIDB,
		legacyUUIDC,
	} {
		rec := doReq(t, h, http.MethodPost, "/api/scan/resolve", map[string]any{"input": scanInput}, tok)
		var scanResp struct {
			Kind    string  `json:"kind"`
			Product Product `json:"product"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &scanResp)
		if scanResp.Kind != "product" || scanResp.Product.ID != prodD.ID {
			t.Fatalf("chained merge scan %q expected product %d, got %+v", scanInput, prodD.ID, scanResp)
		}
	}

	// Deleting destination prodD cascades and removes merge aliases cleanly
	rec = doReq(t, h, http.MethodDelete, fmt.Sprintf("/api/products/%d", prodD.ID), nil, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete prodD expected 200, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodGet, fmt.Sprintf("/go/p/%d", prodB.ID), nil, tok)
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/?alert=product_not_found" {
		t.Fatalf("expected product_not_found redirect after destination deleted, got %d %q", rec.Code, rec.Header().Get("Location"))
	}
}

func TestScanResolveRetailBarcodeEquivalence(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	srv := NewServer(conn, nil)
	h := srv.Handler()

	rec := doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{
		"email": "admin@home.local", "password": "password123",
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("setup expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123", "mode": "bearer",
	}, "")
	var loginResp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)
	tok := loginResp.Token

	// Create category + location
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Pantry"}, tok)
	var catResp struct{ Category Category }
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)
	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Shelf"}, tok)
	var locResp struct{ Location Location }
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)

	createProductWithBarcode := func(prodName, varName, barcode string) (Product, Variant) {
		rec := doReq(t, h, http.MethodPost, "/api/products", map[string]any{
			"name":                prodName,
			"category_id":         catResp.Category.ID,
			"default_location_id": locResp.Location.ID,
		}, tok)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create product %s failed: %d %s", prodName, rec.Code, rec.Body.String())
		}
		var pResp struct{ Product Product }
		_ = json.Unmarshal(rec.Body.Bytes(), &pResp)

		rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/variants", pResp.Product.ID), map[string]any{
			"name": varName,
		}, tok)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create variant %s failed: %d %s", varName, rec.Code, rec.Body.String())
		}
		var vResp struct{ Variant Variant }
		_ = json.Unmarshal(rec.Body.Bytes(), &vResp)

		rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/variants/%d/barcodes", vResp.Variant.ID), map[string]any{
			"barcode":          barcode,
			"default_quantity": 2,
		}, tok)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create barcode %s failed: %d %s", barcode, rec.Code, rec.Body.String())
		}
		return pResp.Product, vResp.Variant
	}

	// Stored 12-digit UPC-A
	bagelProd, bagelVar := createProductWithBarcode("Bagel", "THOMAS' Plain Bagels", "048121277079")
	// Stored 13-digit leading-zero EAN-13
	pastaProd, pastaVar := createProductWithBarcode("Pasta", "Imported Rigatoni", "0810732022887")
	// Exact-match precedence pair: both 12-digit and 13-digit stored on distinct products
	exact12Prod, exact12Var := createProductWithBarcode("Exact 12", "12-digit variant", "012345678905")
	exact13Prod, exact13Var := createProductWithBarcode("Exact 13", "13-digit variant", "0012345678905")

	resolve := func(input string) struct {
		Kind        string  `json:"kind"`
		VariantID   int64   `json:"variant_id"`
		VariantName string  `json:"variant_name"`
		Product     Product `json:"product"`
		Barcode     any     `json:"barcode"`
	} {
		rec := doReq(t, h, http.MethodPost, "/api/scan/resolve", map[string]any{"input": input}, tok)
		if rec.Code != http.StatusOK {
			t.Fatalf("POST /api/scan/resolve %q expected 200, got %d: %s", input, rec.Code, rec.Body.String())
		}
		var out struct {
			Kind        string  `json:"kind"`
			VariantID   int64   `json:"variant_id"`
			VariantName string  `json:"variant_name"`
			Product     Product `json:"product"`
			Barcode     any     `json:"barcode"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out
	}

	// 13-digit EAN-13 scan matches stored 12-digit UPC-A
	if got := resolve("0048121277079"); got.Kind != "barcode" || got.Product.ID != bagelProd.ID || got.VariantID != bagelVar.ID {
		t.Fatalf("13-digit EAN-13 scan expected Bagel variant %d, got %+v", bagelVar.ID, got)
	}

	// 14-digit GTIN-14 scan matches stored 12-digit UPC-A
	if got := resolve("00048121277079"); got.Kind != "barcode" || got.Product.ID != bagelProd.ID || got.VariantID != bagelVar.ID {
		t.Fatalf("14-digit GTIN-14 scan expected Bagel variant %d, got %+v", bagelVar.ID, got)
	}

	// 11-digit leading-zero-stripped scan matches stored 12-digit UPC-A
	if got := resolve("48121277079"); got.Kind != "barcode" || got.Product.ID != bagelProd.ID || got.VariantID != bagelVar.ID {
		t.Fatalf("11-digit scan expected Bagel variant %d, got %+v", bagelVar.ID, got)
	}

	// 12-digit UPC-A scan matches stored 13-digit leading-zero EAN-13
	if got := resolve("810732022887"); got.Kind != "barcode" || got.Product.ID != pastaProd.ID || got.VariantID != pastaVar.ID {
		t.Fatalf("12-digit UPC-A scan expected Pasta variant %d, got %+v", pastaVar.ID, got)
	}

	// Exact match takes precedence when both 12-digit and 13-digit forms exist
	if got := resolve("012345678905"); got.Kind != "barcode" || got.Product.ID != exact12Prod.ID || got.VariantID != exact12Var.ID {
		t.Fatalf("exact 12-digit scan expected variant %d, got %+v", exact12Var.ID, got)
	}
	if got := resolve("0012345678905"); got.Kind != "barcode" || got.Product.ID != exact13Prod.ID || got.VariantID != exact13Var.ID {
		t.Fatalf("exact 13-digit scan expected variant %d, got %+v", exact13Var.ID, got)
	}

	// Unrecognized retail barcode still returns unknown
	if got := resolve("0999999999999"); got.Kind != "unknown" {
		t.Fatalf("unrecognized barcode expected kind=unknown, got %+v", got)
	}
}

type apiRoundTripFunc func(*http.Request) (*http.Response, error)

func (f apiRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func setupCatalogTestServer(t *testing.T) (*Server, http.Handler, string, int64, int64) {
	t.Helper()
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	srv := NewServer(conn, nil)
	h := srv.Handler()

	rec := doReq(t, h, http.MethodPost, "/api/auth/setup", map[string]any{
		"email": "admin@home.local", "password": "password123",
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("setup expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "admin@home.local", "password": "password123", "mode": "bearer",
	}, "")
	var loginResp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &loginResp)

	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Groceries"}, loginResp.Token)
	var catResp struct {
		Category Category `json:"category"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Pantry"}, loginResp.Token)
	var locResp struct {
		Location Location `json:"location"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)

	return srv, h, loginResp.Token, catResp.Category.ID, locResp.Location.ID
}

func TestCatalogAwareUPCClassifyAndAuthStatusLLMEnabled(t *testing.T) {
	srv, h, tok, catID, locID := setupCatalogTestServer(t)

	// Initially llm_enabled is false in /api/auth/status
	rec := doReq(t, h, http.MethodGet, "/api/auth/status", nil, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/auth/status expected 200, got %d", rec.Code)
	}
	var statusResp struct {
		LLMEnabled bool `json:"llm_enabled"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &statusResp)
	if statusResp.LLMEnabled {
		t.Fatalf("expected llm_enabled=false by default")
	}

	// Create existing catalog products
	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Mustard, Dijon", "category_id": catID, "default_location_id": locID,
	}, tok)
	var mustResp struct {
		Product Product `json:"product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &mustResp)

	// Configure LLM
	rec = doReq(t, h, http.MethodPatch, "/api/settings", map[string]any{
		"llm_provider": "openai-compatible",
		"llm_model":    "llama3.2",
		"llm_base_url": "http://llm.test/v1",
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("PATCH /api/settings expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Now llm_enabled is true in /api/auth/status
	rec = doReq(t, h, http.MethodGet, "/api/auth/status", nil, tok)
	_ = json.Unmarshal(rec.Body.Bytes(), &statusResp)
	if !statusResp.LLMEnabled {
		t.Fatalf("expected llm_enabled=true after configuring LLM")
	}

	var capturedPrompt string
	srv.LLM.HTTPClient = &http.Client{
		Transport: apiRoundTripFunc(func(r *http.Request) (*http.Response, error) {
			b, _ := io.ReadAll(r.Body)
			capturedPrompt = string(b)
			content := fmt.Sprintf(`{"matched_product_id":%d,"product_name":"Mustard, Dijon","product_value":12,"product_unit_type":"weight","product_unit":"oz","category_id":%d}`, mustResp.Product.ID, catID)
			body := fmt.Sprintf(`{"choices":[{"message":{"content":%q}}]}`, content)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}

	rec = doReq(t, h, http.MethodPost, "/api/upc/classify", map[string]any{
		"title":       "Burman's Organic Dijon Mustard",
		"description": "Tangy stone-ground dijon mustard",
		"quantity":    "12 oz",
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/upc/classify expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(capturedPrompt, "Mustard, Dijon") || !strings.Contains(capturedPrompt, "Tangy stone-ground dijon mustard") {
		t.Fatalf("expected LLM prompt to contain candidate product and description, got: %s", capturedPrompt)
	}

	var clsResp struct {
		Enabled        bool `json:"enabled"`
		Classification struct {
			ProductName      string `json:"product_name"`
			MatchedProductID *int64 `json:"matched_product_id"`
		} `json:"classification"`
		MatchedProduct *Product `json:"matched_product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &clsResp)
	if !clsResp.Enabled || clsResp.Classification.MatchedProductID == nil || *clsResp.Classification.MatchedProductID != mustResp.Product.ID {
		t.Fatalf("expected matched_product_id=%d, got %+v", mustResp.Product.ID, clsResp)
	}
	if clsResp.MatchedProduct == nil || clsResp.MatchedProduct.ID != mustResp.Product.ID {
		t.Fatalf("expected matched_product summary in response, got %+v", clsResp.MatchedProduct)
	}
}

func TestDuplicateProductNameGuard(t *testing.T) {
	srv, h, tok, catID, locID := setupCatalogTestServer(t)

	rec := doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Mustard, Dijon", "category_id": catID, "default_location_id": locID,
	}, tok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create product 1 expected 201, got %d", rec.Code)
	}
	var p1 struct {
		Product Product `json:"product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &p1)

	// Exact case-insensitive duplicate on POST /api/products -> 409 with existing_product
	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "  mustard, dijon  ", "category_id": catID, "default_location_id": locID,
	}, tok)
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate create expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
	var conflictResp struct {
		Error           string `json:"error"`
		ExistingProduct struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"existing_product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &conflictResp)
	if conflictResp.ExistingProduct.ID != p1.Product.ID || conflictResp.ExistingProduct.Name != "Mustard, Dijon" {
		t.Fatalf("unexpected conflict payload: %+v", conflictResp)
	}

	// Duplicate on POST /api/workflows/purchase (new_product) -> 409
	rec = doReq(t, h, http.MethodPost, "/api/workflows/purchase", map[string]any{
		"new_product": map[string]any{
			"name": "MUSTARD, DIJON", "category_id": catID, "default_location_id": locID,
		},
		"quantity": 1,
	}, tok)
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate purchase new_product expected 409, got %d: %s", rec.Code, rec.Body.String())
	}

	// Create second distinct product, then attempt renaming it to existing name -> 409
	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name": "Mustard, Yellow", "category_id": catID, "default_location_id": locID,
	}, tok)
	var p2 struct {
		Product Product `json:"product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &p2)

	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/products/%d", p2.Product.ID), map[string]any{
		"name": "mustard, dijon", "category_id": catID, "default_location_id": locID,
	}, tok)
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate rename expected 409, got %d: %s", rec.Code, rec.Body.String())
	}

	// Simulate pre-existing legacy duplicate directly in SQLite; editing non-name metadata without changing name still succeeds
	now := db.NowUTC()
	res, err := srv.DB.Exec(`
		INSERT INTO products (name, category_id, default_location_id, use_average_for_due_date, label_print_mode, manually_added_to_shopping_list, created_at, updated_at)
		VALUES ('Mustard, Dijon', ?, ?, 0, 'per_item', 0, ?, ?)
	`, catID, locID, now, now)
	if err != nil {
		t.Fatalf("insert legacy dup: %v", err)
	}
	legacyDupID, _ := res.LastInsertId()

	rec = doReq(t, h, http.MethodPatch, fmt.Sprintf("/api/products/%d", legacyDupID), map[string]any{
		"name": "Mustard, Dijon", "category_id": catID, "default_location_id": locID, "minimum_value": 2,
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("metadata edit on legacy duplicate expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestBulkReclassifySuggestAndApply(t *testing.T) {
	srv, h, tok, catID, locID := setupCatalogTestServer(t)

	createProd := func(name string) Product {
		rec := doReq(t, h, http.MethodPost, "/api/products", map[string]any{
			"name": name, "category_id": catID, "default_location_id": locID,
		}, tok)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create %q expected 201, got %d: %s", name, rec.Code, rec.Body.String())
		}
		var out struct {
			Product Product `json:"product"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out.Product
	}

	existingChicken := createProd("Chicken, Breast")
	meatChicken := createProd("Meat, Chicken, Breast")
	appleA := createProd("Apple, Gala")
	appleB := createProd("Produce, Apples, Gala")
	beans := createProd("Canned Black Beans")

	// Give appleB more in-stock items than appleA so appleB must win as deterministic survivor
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{"product_id": appleA.ID, "quantity": 1}, tok)
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{"product_id": appleB.ID, "quantity": 3}, tok)
	doReq(t, h, http.MethodPost, "/api/items", map[string]any{"product_id": meatChicken.ID, "quantity": 2}, tok)

	// Suggest fails with 400 when LLM is disabled
	rec := doReq(t, h, http.MethodPost, "/api/products/reclassify/suggest", map[string]any{
		"product_ids": []int64{meatChicken.ID, appleA.ID},
	}, tok)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("suggest without LLM expected 400, got %d: %s", rec.Code, rec.Body.String())
	}

	// Configure LLM and test suggest
	doReq(t, h, http.MethodPatch, "/api/settings", map[string]any{
		"llm_provider": "openai-compatible",
		"llm_model":    "llama3.2",
		"llm_base_url": "http://llm.test/v1",
	}, tok)

	srv.LLM.HTTPClient = &http.Client{
		Transport: apiRoundTripFunc(func(r *http.Request) (*http.Response, error) {
			content := fmt.Sprintf(`{"items":[{"product_id":%d,"suggested_name":"Chicken, Breast"},{"product_id":%d,"suggested_name":"Apples, Gala"}]}`, meatChicken.ID, appleA.ID)
			body := fmt.Sprintf(`{"choices":[{"message":{"content":%q}}]}`, content)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}

	rec = doReq(t, h, http.MethodPost, "/api/products/reclassify/suggest", map[string]any{
		"product_ids": []int64{meatChicken.ID, appleA.ID},
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("suggest with LLM expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var suggestResp struct {
		Suggestions []struct {
			ProductID     int64  `json:"product_id"`
			CurrentName   string `json:"current_name"`
			SuggestedName string `json:"suggested_name"`
		} `json:"suggestions"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &suggestResp)
	if len(suggestResp.Suggestions) != 2 || suggestResp.Suggestions[0].SuggestedName != "Chicken, Breast" || suggestResp.Suggestions[1].SuggestedName != "Apples, Gala" {
		t.Fatalf("unexpected suggest response: %+v", suggestResp)
	}

	// Invalid apply rolls back atomically
	rec = doReq(t, h, http.MethodPost, "/api/products/reclassify/apply", map[string]any{
		"items": []map[string]any{
			{"product_id": beans.ID, "new_name": "Beans, Black"},
			{"product_id": 999999, "new_name": "Ghost"},
		},
	}, tok)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("apply with missing product expected 404, got %d", rec.Code)
	}
	// Verify beans was NOT renamed (atomic rollback)
	rec = doReq(t, h, http.MethodGet, fmt.Sprintf("/api/products/%d", beans.ID), nil, tok)
	var beansCheck struct {
		Product Product `json:"product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &beansCheck)
	if beansCheck.Product.Name != "Canned Black Beans" {
		t.Fatalf("expected rollback to preserve %q, got %q", "Canned Black Beans", beansCheck.Product.Name)
	}

	// Apply rename + batch collision merge + merge into unselected existing product
	rec = doReq(t, h, http.MethodPost, "/api/products/reclassify/apply", map[string]any{
		"items": []map[string]any{
			{"product_id": meatChicken.ID, "new_name": "Chicken, Breast"}, // merges into unselected existingChicken
			{"product_id": appleA.ID, "new_name": "Apples, Gala"},         // merges into appleB (3 items > 1 item)
			{"product_id": appleB.ID, "new_name": "Apples, Gala"},         // survives & renamed
			{"product_id": beans.ID, "new_name": "Beans, Black"},          // renamed
		},
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("apply expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var applyResp struct {
		Renamed int `json:"renamed"`
		Merged  int `json:"merged"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &applyResp)
	if applyResp.Renamed != 2 || applyResp.Merged != 2 {
		t.Fatalf("expected renamed=2 merged=2, got %+v", applyResp)
	}

	// Verify unselected existingChicken received meatChicken's 2 items & merge alias works
	rec = doReq(t, h, http.MethodGet, fmt.Sprintf("/api/products/%d", existingChicken.ID), nil, tok)
	var chickDetail struct {
		Product Product `json:"product"`
		Items   []Item  `json:"items"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &chickDetail)
	if len(chickDetail.Items) != 2 {
		t.Fatalf("expected existingChicken to have 2 merged items, got %d", len(chickDetail.Items))
	}
	rec = doReq(t, h, http.MethodPost, "/api/scan/resolve", map[string]any{
		"input": fmt.Sprintf("https://itemized.local/go/p/%d", meatChicken.ID),
	}, tok)
	var resolveAlias struct {
		Kind    string  `json:"kind"`
		Product Product `json:"product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resolveAlias)
	if resolveAlias.Kind != "product" || resolveAlias.Product.ID != existingChicken.ID {
		t.Fatalf("expected merged alias for meatChicken to resolve to existingChicken, got %+v", resolveAlias)
	}

	// Verify appleB survived, was renamed to "Apples, Gala", and now has 4 items (3 + 1 from appleA)
	rec = doReq(t, h, http.MethodGet, fmt.Sprintf("/api/products/%d", appleB.ID), nil, tok)
	var appleDetail struct {
		Product Product `json:"product"`
		Items   []Item  `json:"items"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &appleDetail)
	if appleDetail.Product.Name != "Apples, Gala" || len(appleDetail.Items) != 4 {
		t.Fatalf("expected appleB to survive as 'Apples, Gala' with 4 items, got name=%q items=%d", appleDetail.Product.Name, len(appleDetail.Items))
	}
}

func TestReclassifySuggestPrefixAwareAndCategoryContext(t *testing.T) {
	srv, h, tok, _, locID := setupCatalogTestServer(t)

	rec := doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Canned Goods & Soups"}, tok)
	var soupCat struct {
		Category Category `json:"category"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &soupCat)

	createProd := func(name string) Product {
		rec := doReq(t, h, http.MethodPost, "/api/products", map[string]any{
			"name": name, "category_id": soupCat.Category.ID, "default_location_id": locID,
		}, tok)
		var out struct {
			Product Product `json:"product"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out.Product
	}

	// Create 31 other prefixes with >=2 products each so "Soup" (only 2 products) would fall outside global top 30
	for i := 0; i < 31; i++ {
		prefix := fmt.Sprintf("Prefix%02d", i)
		createProd(prefix + ", One")
		createProd(prefix + ", Two")
	}
	createProd("Beans, Black")
	createProd("Beans, Pinto")
	createProd("Beans, Kidney")
	soupTarget := createProd("Soup, Italian Bean")
	createProd("Soup, Tomato")

	// Attach one redundant variant matching current name and one brand variant
	doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/variants", soupTarget.ID), map[string]any{
		"name": "Soup, Italian Bean",
	}, tok)
	doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/variants", soupTarget.ID), map[string]any{
		"name": "Progresso Italian Style Bean Soup",
	}, tok)

	// Verify loadCatalogNamingContext includes "Soup" in prefixes and ranks "Soup, Tomato" ahead of "Beans, ..."
	candidates, prefixes, err := srv.loadCatalogNamingContext(context.Background(), []string{"Soup, Italian Bean"}, map[int64]bool{soupTarget.ID: true})
	if err != nil {
		t.Fatalf("loadCatalogNamingContext failed: %v", err)
	}
	foundSoupPrefix := false
	for _, p := range prefixes {
		if p == "Soup" {
			foundSoupPrefix = true
			break
		}
	}
	if !foundSoupPrefix {
		t.Fatalf("expected 'Soup' to be guaranteed in common_prefixes, got %v", prefixes)
	}
	if len(candidates) == 0 || candidates[0].Name != "Soup, Tomato" {
		t.Fatalf("expected 'Soup, Tomato' to rank first ahead of Beans candidates, got %+v", candidates)
	}

	// Verify handleReclassifySuggest passes category_name and filters redundant variant name
	doReq(t, h, http.MethodPatch, "/api/settings", map[string]any{
		"llm_provider": "openai-compatible",
		"llm_model":    "llama3.2",
		"llm_base_url": "http://llm.test/v1",
	}, tok)

	var capturedBody string
	srv.LLM.HTTPClient = &http.Client{
		Transport: apiRoundTripFunc(func(r *http.Request) (*http.Response, error) {
			b, _ := io.ReadAll(r.Body)
			capturedBody = string(b)
			content := fmt.Sprintf(`{"items":[{"product_id":%d,"suggested_name":"Soup, Italian Bean"}]}`, soupTarget.ID)
			body := fmt.Sprintf(`{"choices":[{"message":{"content":%q}}]}`, content)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}

	rec = doReq(t, h, http.MethodPost, "/api/products/reclassify/suggest", map[string]any{
		"product_ids": []int64{soupTarget.ID},
	}, tok)
	if rec.Code != http.StatusOK {
		t.Fatalf("reclassify suggest expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var openAIReq struct {
		Messages []struct {
			Content string `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal([]byte(capturedBody), &openAIReq); err != nil || len(openAIReq.Messages) < 2 {
		t.Fatalf("failed to decode captured OpenAI request: %v (%s)", err, capturedBody)
	}
	promptText := openAIReq.Messages[1].Content
	if !strings.Contains(promptText, "Canned Goods \\u0026 Soups") && !strings.Contains(promptText, "Canned Goods & Soups") {
		t.Fatalf("expected prompt to include category_name, got: %s", promptText)
	}
	if !strings.Contains(promptText, "Progresso Italian Style Bean Soup") {
		t.Fatalf("expected prompt to include non-redundant variant name, got: %s", promptText)
	}
	if strings.Contains(promptText, `"variant_names":["Soup, Italian Bean"`) {
		t.Fatalf("expected redundant variant name equal to current_name to be omitted, got: %s", promptText)
	}
}
