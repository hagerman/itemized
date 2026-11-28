package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestConsumeNextProductItemFEFOAndEdgeCases(t *testing.T) {
	h, token := setupTestAuthedHandler(t)

	// Create category, location, and product.
	rec := doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Dairy"}, token)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create category: %d %s", rec.Code, rec.Body.String())
	}
	var catResp struct {
		Category Category `json:"category"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Fridge", "is_freezer": false}, token)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create location: %d %s", rec.Code, rec.Body.String())
	}
	var locResp struct {
		Location Location `json:"location"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)

	rec = doReq(t, h, http.MethodPost, "/api/products", map[string]any{
		"name":                     "Milk, Whole",
		"category_id":              catResp.Category.ID,
		"default_location_id":      locResp.Location.ID,
		"use_average_for_due_date": false,
	}, token)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create product: %d %s", rec.Code, rec.Body.String())
	}
	var prodResp struct {
		Product Product `json:"product"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &prodResp)
	pid := prodResp.Product.ID

	// 404 for missing product.
	rec = doReq(t, h, http.MethodPost, "/api/products/99999/consume-next", nil, token)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("missing product expected 404, got %d", rec.Code)
	}

	// 409 when product has no unconsumed items.
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/consume-next", pid), nil, token)
	if rec.Code != http.StatusConflict {
		t.Fatalf("empty stock expected 409, got %d: %s", rec.Code, rec.Body.String())
	}

	// Add 4 items: unset due date #1, later due date, soonest due date, unset due date #2.
	createItem := func(due *string) int64 {
		t.Helper()
		body := map[string]any{"product_id": pid, "location_id": locResp.Location.ID, "quantity": 1}
		if due != nil {
			body["due_on_date"] = *due
		}
		r := doReq(t, h, http.MethodPost, "/api/items", body, token)
		if r.Code != http.StatusCreated {
			t.Fatalf("create item: %d %s", r.Code, r.Body.String())
		}
		var resp struct {
			Items []Item `json:"items"`
		}
		_ = json.Unmarshal(r.Body.Bytes(), &resp)
		return resp.Items[0].ID
	}

	dLate := "2026-12-20"
	dSoon := "2026-12-05"
	idUnset1 := createItem(nil)
	idLate := createItem(&dLate)
	idSoon := createItem(&dSoon)
	idUnset2 := createItem(nil)

	consumeNext := func() (Item, Item) {
		t.Helper()
		r := doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/consume-next", pid), nil, token)
		if r.Code != http.StatusOK {
			t.Fatalf("consume-next expected 200, got %d: %s", r.Code, r.Body.String())
		}
		var resp struct {
			Item     Item `json:"item"`
			Previous Item `json:"previous"`
		}
		if err := json.Unmarshal(r.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode consume-next: %v", err)
		}
		return resp.Item, resp.Previous
	}

	// 1st consume -> soonest due date (idSoon).
	it, prev := consumeNext()
	if it.ID != idSoon || it.ConsumedOnDate == nil || prev.ConsumedOnDate != nil {
		t.Fatalf("1st consume expected id=%d consumed, got item=%+v prev=%+v", idSoon, it, prev)
	}
	// 2nd consume -> later due date (idLate).
	it, _ = consumeNext()
	if it.ID != idLate {
		t.Fatalf("2nd consume expected id=%d, got %d", idLate, it.ID)
	}
	// 3rd consume -> earliest-entered unset due date (idUnset1).
	it, _ = consumeNext()
	if it.ID != idUnset1 {
		t.Fatalf("3rd consume expected id=%d, got %d", idUnset1, it.ID)
	}
	// 4th consume -> second unset due date (idUnset2).
	it, _ = consumeNext()
	if it.ID != idUnset2 {
		t.Fatalf("4th consume expected id=%d, got %d", idUnset2, it.ID)
	}
	// 5th consume -> 409 Conflict.
	rec = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/consume-next", pid), nil, token)
	if rec.Code != http.StatusConflict {
		t.Fatalf("5th consume expected 409, got %d", rec.Code)
	}
}

func TestAccountQuickActionsPreferenceAPI(t *testing.T) {
	h, token := setupTestAuthedHandler(t)

	// GET /api/auth/me defaults to quick_actions_enabled: true.
	rec := doReq(t, h, http.MethodGet, "/api/auth/me", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/auth/me expected 200, got %d", rec.Code)
	}
	var meResp struct {
		User struct {
			QuickActionsEnabled bool `json:"quick_actions_enabled"`
		} `json:"user"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &meResp)
	if !meResp.User.QuickActionsEnabled {
		t.Fatalf("expected default quick_actions_enabled=true")
	}

	// PATCH /api/auth/account toggles quick_actions_enabled to false independently.
	rec = doReq(t, h, http.MethodPatch, "/api/auth/account", map[string]any{
		"quick_actions_enabled": false,
	}, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("PATCH /api/auth/account expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &meResp)
	if meResp.User.QuickActionsEnabled {
		t.Fatalf("expected quick_actions_enabled=false after PATCH")
	}

	// GET /api/auth/status reflects the persisted false value.
	rec = doReq(t, h, http.MethodGet, "/api/auth/status", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/auth/status expected 200, got %d", rec.Code)
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &meResp)
	if meResp.User.QuickActionsEnabled {
		t.Fatalf("expected /api/auth/status quick_actions_enabled=false")
	}
}
