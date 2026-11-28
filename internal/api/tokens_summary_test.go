package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"itemized/internal/auth"
	"itemized/internal/db"
	"itemized/internal/demo"
	"itemized/internal/domain"
)

func TestAPITokensAndSummaryEndpoint(t *testing.T) {
	h, adminSessionTok := setupTestAuthedHandler(t)

	// Unauthenticated /api/summary rejected with 401.
	rec := doReq(t, h, http.MethodGet, "/api/summary", nil, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated summary expected 401, got %d", rec.Code)
	}

	// Create a Personal API Token via session auth.
	rec = doReq(t, h, http.MethodPost, "/api/auth/tokens", map[string]any{
		"name":            "Home Assistant",
		"expires_in_days": 90,
	}, adminSessionTok)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create token expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var createResp struct {
		Token    string        `json:"token"`
		Metadata auth.APIToken `json:"metadata"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("decode create token: %v", err)
	}
	if !strings.HasPrefix(createResp.Token, "itm_") || createResp.Metadata.Name != "Home Assistant" || createResp.Metadata.ExpiresAt == nil {
		t.Fatalf("unexpected create token response: %+v", createResp)
	}

	apiKey := createResp.Token

	// Seed a category, location, and 3 products (overdue, due soon, shopping list).
	rec = doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "Food"}, apiKey)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create category with api token expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var catResp struct {
		Category Category `json:"category"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &catResp)

	rec = doReq(t, h, http.MethodPost, "/api/locations", map[string]any{"name": "Fridge", "is_freezer": false}, apiKey)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create location expected 201, got %d", rec.Code)
	}
	var locResp struct {
		Location Location `json:"location"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &locResp)

	createProduct := func(name string, minVal *int, manualShop bool) int64 {
		t.Helper()
		body := map[string]any{
			"name":                     name,
			"category_id":              catResp.Category.ID,
			"default_location_id":      locResp.Location.ID,
			"use_average_for_due_date": false,
		}
		if minVal != nil {
			body["minimum_value"] = *minVal
		}
		r := doReq(t, h, http.MethodPost, "/api/products", body, apiKey)
		if r.Code != http.StatusCreated {
			t.Fatalf("create product %q: %d %s", name, r.Code, r.Body.String())
		}
		var pr struct {
			Product Product `json:"product"`
		}
		_ = json.Unmarshal(r.Body.Bytes(), &pr)
		if manualShop {
			_ = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/toggle-shopping-list", pr.Product.ID), nil, apiKey)
		}
		return pr.Product.ID
	}

	minTwo := 2
	pOverdue := createProduct("Milk, Whole", nil, false)
	pDueSoon := createProduct("Yogurt, Plain", nil, false)
	pLowStock := createProduct("Eggs, Large", &minTwo, false)

	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format(domain.DateLayout)
	inTwoDays := time.Now().UTC().AddDate(0, 0, 2).Format(domain.DateLayout)
	farOut := time.Now().UTC().AddDate(0, 0, 30).Format(domain.DateLayout)

	_ = doReq(t, h, http.MethodPost, "/api/items", map[string]any{"product_id": pOverdue, "location_id": locResp.Location.ID, "quantity": 1, "due_on_date": yesterday}, apiKey)
	_ = doReq(t, h, http.MethodPost, "/api/items", map[string]any{"product_id": pDueSoon, "location_id": locResp.Location.ID, "quantity": 2, "due_on_date": inTwoDays}, apiKey)
	_ = doReq(t, h, http.MethodPost, "/api/items", map[string]any{"product_id": pLowStock, "location_id": locResp.Location.ID, "quantity": 1, "due_on_date": farOut}, apiKey)
	// Pin pDueSoon to shopping list after items are added (auto-clear clears manual pin on item creation).
	_ = doReq(t, h, http.MethodPost, fmt.Sprintf("/api/products/%d/toggle-shopping-list", pDueSoon), nil, apiKey)

	// Fetch GET /api/summary using the Personal API Token.
	rec = doReq(t, h, http.MethodGet, "/api/summary", nil, apiKey)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/summary expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var sumResp struct {
		Counts               SummaryCounts    `json:"counts"`
		DueSoonProducts      []SummaryProduct `json:"due_soon_products"`
		OverdueProducts      []SummaryProduct `json:"overdue_products"`
		ShoppingListProducts []SummaryProduct `json:"shopping_list_products"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &sumResp); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	if sumResp.Counts.AllProducts != 3 || sumResp.Counts.InStockProducts != 3 || sumResp.Counts.InStockItems != 4 {
		t.Fatalf("unexpected stock counts: %+v", sumResp.Counts)
	}
	if sumResp.Counts.Overdue != 1 || len(sumResp.OverdueProducts) != 1 || sumResp.OverdueProducts[0].Name != "Milk, Whole" {
		t.Fatalf("unexpected overdue summary: counts=%+v list=%+v", sumResp.Counts, sumResp.OverdueProducts)
	}
	if sumResp.Counts.DueSoon != 1 || len(sumResp.DueSoonProducts) != 1 || sumResp.DueSoonProducts[0].Name != "Yogurt, Plain" {
		t.Fatalf("unexpected due_soon summary: counts=%+v list=%+v", sumResp.Counts, sumResp.DueSoonProducts)
	}
	if sumResp.Counts.ShoppingList != 2 || sumResp.Counts.LowStock != 1 || len(sumResp.ShoppingListProducts) != 2 {
		t.Fatalf("unexpected shopping_list summary: counts=%+v list=%+v", sumResp.Counts, sumResp.ShoppingListProducts)
	}

	// List tokens returns metadata without plaintext secret.
	rec = doReq(t, h, http.MethodGet, "/api/auth/tokens", nil, adminSessionTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/auth/tokens expected 200, got %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), apiKey) {
		t.Fatalf("GET /api/auth/tokens must never leak plaintext token")
	}

	// Revoke token -> subsequent request with apiKey gets 401.
	rec = doReq(t, h, http.MethodDelete, fmt.Sprintf("/api/auth/tokens/%d", createResp.Metadata.ID), nil, adminSessionTok)
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE /api/auth/tokens/{id} expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	rec = doReq(t, h, http.MethodGet, "/api/summary", nil, apiKey)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("revoked api token expected 401, got %d", rec.Code)
	}
}

func TestAPITokensDisabledInDemoMode(t *testing.T) {
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer conn.Close()

	mgr, err := demo.NewManager(conn, time.Hour)
	if err != nil {
		t.Fatalf("demo.NewManager: %v", err)
	}
	srv := NewServer(conn, nil)
	srv.EnableDemoMode(mgr)
	h := srv.Handler()

	rec := doReq(t, h, http.MethodPost, "/api/auth/tokens", map[string]any{"name": "HA"}, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("demo mode create token expected 403, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodDelete, "/api/auth/tokens/1", nil, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("demo mode delete token expected 403, got %d", rec.Code)
	}
	rec = doReq(t, h, http.MethodGet, "/api/summary", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("demo mode summary expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
