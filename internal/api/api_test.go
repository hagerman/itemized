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
