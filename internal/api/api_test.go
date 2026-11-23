package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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

	// 9. Consume item 1 + Undo via PATCH
	rec = doReq(t, h, http.MethodPost, "/api/items/1/consume", nil, memberTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("consume failed: %d", rec.Code)
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
