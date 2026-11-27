package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"itemized/internal/db"
)

func setupTestAuthedHandler(t *testing.T) (http.Handler, string) {
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
	if rec.Code != http.StatusOK {
		t.Fatalf("login expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var loginResp struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("decode login: %v", err)
	}
	return h, loginResp.Token
}

func TestStarterTaxonomyFullAndIdempotent(t *testing.T) {
	h, token := setupTestAuthedHandler(t)

	// Unauthenticated request rejected with 401.
	rec := doReq(t, h, http.MethodPost, "/api/onboarding/starter-taxonomy", map[string]any{}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 unauthenticated, got %d", rec.Code)
	}

	// Fresh seed with empty JSON object seeds both categories and locations.
	rec = doReq(t, h, http.MethodPost, "/api/onboarding/starter-taxonomy", map[string]any{}, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		CategoriesCreated int        `json:"categories_created"`
		LocationsCreated  int        `json:"locations_created"`
		Categories        []Category `json:"categories"`
		Locations         []Location `json:"locations"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.CategoriesCreated != 24 || len(resp.Categories) != 24 {
		t.Fatalf("expected 24 starter categories, got created=%d total=%d", resp.CategoriesCreated, len(resp.Categories))
	}
	if resp.LocationsCreated != 11 || len(resp.Locations) != 11 {
		t.Fatalf("expected 11 starter locations, got created=%d total=%d", resp.LocationsCreated, len(resp.Locations))
	}

	// Verify freezer flags and hierarchy paths.
	freezerPaths := map[string]bool{}
	for _, loc := range resp.Locations {
		if loc.IsFreezer {
			freezerPaths[loc.HierarchyName] = true
		}
	}
	if !freezerPaths["Kitchen > Freezer"] || !freezerPaths["Garage > Chest Freezer"] {
		t.Fatalf("expected Kitchen > Freezer and Garage > Chest Freezer to be marked freezer, got %v", freezerPaths)
	}

	// Re-running is idempotent and creates 0 duplicates.
	rec = doReq(t, h, http.MethodPost, "/api/onboarding/starter-taxonomy", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("second call expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode second response: %v", err)
	}
	if resp.CategoriesCreated != 0 || resp.LocationsCreated != 0 {
		t.Fatalf("expected 0 created on idempotent re-run, got cats=%d locs=%d", resp.CategoriesCreated, resp.LocationsCreated)
	}
	if len(resp.Categories) != 24 || len(resp.Locations) != 11 {
		t.Fatalf("expected totals unchanged, got cats=%d locs=%d", len(resp.Categories), len(resp.Locations))
	}
}

func TestStarterTaxonomyPartialAndPreexistingOverlap(t *testing.T) {
	h, token := setupTestAuthedHandler(t)

	// Pre-create "groceries" (lowercase) to verify case-insensitive matching reuses parent.
	rec := doReq(t, h, http.MethodPost, "/api/categories", map[string]any{"name": "groceries"}, token)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create category expected 201, got %d", rec.Code)
	}

	// Seed only categories.
	rec = doReq(t, h, http.MethodPost, "/api/onboarding/starter-taxonomy", map[string]any{
		"categories": true,
		"locations":  false,
	}, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("categories-only expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		CategoriesCreated int        `json:"categories_created"`
		LocationsCreated  int        `json:"locations_created"`
		Categories        []Category `json:"categories"`
		Locations         []Location `json:"locations"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.CategoriesCreated != 23 || len(resp.Categories) != 24 {
		t.Fatalf("expected 23 new categories (reusing groceries), got created=%d total=%d", resp.CategoriesCreated, len(resp.Categories))
	}
	if resp.LocationsCreated != 0 || len(resp.Locations) != 0 {
		t.Fatalf("expected 0 locations, got created=%d total=%d", resp.LocationsCreated, len(resp.Locations))
	}

	// Seed only locations.
	rec = doReq(t, h, http.MethodPost, "/api/onboarding/starter-taxonomy", map[string]any{
		"categories": false,
		"locations":  true,
	}, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("locations-only expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.CategoriesCreated != 0 || resp.LocationsCreated != 11 || len(resp.Locations) != 11 {
		t.Fatalf("expected 11 new locations, got cats=%d locs=%d total=%d", resp.CategoriesCreated, resp.LocationsCreated, len(resp.Locations))
	}

	// Malformed JSON returns 400.
	badReq := httptest.NewRequest(http.MethodPost, "/api/onboarding/starter-taxonomy", strings.NewReader("{bad"))
	badReq.Header.Set("Content-Type", "application/json")
	badReq.Header.Set("Authorization", "Bearer "+token)
	badRec := httptest.NewRecorder()
	h.ServeHTTP(badRec, badReq)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on malformed json, got %d", badRec.Code)
	}
}
