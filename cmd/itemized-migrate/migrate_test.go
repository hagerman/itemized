package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"itemized/internal/api"
	"itemized/internal/auth"
	"itemized/internal/db"
)

type memReader struct {
	collections []LegacyCollection
	users       []LegacyUser
	categories  []LegacyCategory
	locations   []LegacyLocation
	products    []LegacyProduct
	variants    []LegacyVariant
	barcodes    []LegacyBarcode
	items       []LegacyItem
	printers    []LegacyPrinter
}

func (m *memReader) ListCollections(context.Context) ([]LegacyCollection, error) {
	return m.collections, nil
}
func (m *memReader) ListUsersForCollection(context.Context, string, string) ([]LegacyUser, error) {
	return m.users, nil
}
func (m *memReader) ListCategories(context.Context, string) ([]LegacyCategory, error) {
	return m.categories, nil
}
func (m *memReader) ListLocations(context.Context, string) ([]LegacyLocation, error) {
	return m.locations, nil
}
func (m *memReader) ListProducts(context.Context, string) ([]LegacyProduct, error) {
	return m.products, nil
}
func (m *memReader) ListVariants(context.Context, string) ([]LegacyVariant, error) {
	return m.variants, nil
}
func (m *memReader) ListBarcodes(context.Context, string) ([]LegacyBarcode, error) {
	return m.barcodes, nil
}
func (m *memReader) ListItems(context.Context, string) ([]LegacyItem, error) { return m.items, nil }
func (m *memReader) ListPrinters(context.Context, []string) ([]LegacyPrinter, error) {
	return m.printers, nil
}

func TestEndToEndMigrationAndLegacyQRs(t *testing.T) {
	now := time.Now().UTC()
	hash, err := auth.HashPassword("legacyPass123")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}

	parentCatUUID := "10000000-0000-0000-0000-000000000001"
	childCatUUID := "10000000-0000-0000-0000-000000000002"
	parentLocUUID := "20000000-0000-0000-0000-000000000001"
	childLocUUID := "20000000-0000-0000-0000-000000000002"
	prodUUID := "30000000-0000-0000-0000-000000000001"
	varUUID := "40000000-0000-0000-0000-000000000001"
	itemUUID := "50000000-0000-0000-0000-000000000001"
	ownerUUID := "90000000-0000-0000-0000-000000000001"
	printerIP := "192.168.1.55"

	reader := &memReader{
		collections: []LegacyCollection{{ID: "col-1", Name: "Home", OwnerID: ownerUUID}},
		users: []LegacyUser{{
			ID: ownerUUID, Email: "owner@home.local", PasswordDigest: hash,
			DueDateAverageCount: 5, CreatedAt: now, UpdatedAt: now,
		}},
		// Intentionally put child before parent to verify two-pass hierarchy remapping!
		categories: []LegacyCategory{
			{ID: childCatUUID, Name: "Milk", ParentID: &parentCatUUID, CreatedAt: now, UpdatedAt: now},
			{ID: parentCatUUID, Name: "Dairy", CreatedAt: now, UpdatedAt: now},
		},
		locations: []LegacyLocation{
			{ID: childLocUUID, Name: "Top Shelf", ParentID: &parentLocUUID, IsFreezer: false, CreatedAt: now, UpdatedAt: now},
			{ID: parentLocUUID, Name: "Fridge", IsFreezer: false, CreatedAt: now, UpdatedAt: now},
		},
		products: []LegacyProduct{{
			ID: prodUUID, Name: "Milk, Whole", CategoryID: childCatUUID, DefaultLocationID: childLocUUID,
			LabelPrintMode: "per_item", CreatedAt: now, UpdatedAt: now,
		}},
		variants: []LegacyVariant{{
			ID: varUUID, ProductID: prodUUID, Name: "Gallon", CreatedAt: now, UpdatedAt: now,
		}},
		barcodes: []LegacyBarcode{{
			ID: "bc-1", VariantID: varUUID, Barcode: "012345678905", DefaultQuantity: 1, CreatedAt: now, UpdatedAt: now,
		}},
		items: []LegacyItem{{
			ID: itemUUID, ProductID: prodUUID, VariantID: &varUUID, LocationID: &childLocUUID,
			PurchasedOnDate: &now, CreatedAt: now, UpdatedAt: now,
		}},
		printers: []LegacyPrinter{{
			ID: "pr-1", Name: "Zebra ZSB", IPAddress: &printerIP, Status: "active", CreatedAt: now, UpdatedAt: now,
		}},
	}

	// Verify multi-collection requires --collection-id.
	multiReader := *reader
	multiReader.collections = append(multiReader.collections, LegacyCollection{ID: "col-2", Name: "Cabin", OwnerID: ownerUUID})
	connMulti, _ := db.Open(":memory:")
	defer connMulti.Close()
	if _, err := runMigration(context.Background(), &multiReader, connMulti, "", nil); err == nil || !strings.Contains(err.Error(), "multiple collections") {
		t.Fatalf("expected multi-collection error, got %v", err)
	}

	// Run single-collection auto-select migration.
	conn, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer conn.Close()

	var logBuf bytes.Buffer
	report, err := runMigration(context.Background(), reader, conn, "", &logBuf)
	if err != nil {
		t.Fatalf("runMigration failed: %v", err)
	}
	if report.Counts["items"] != 1 || report.Counts["products"] != 1 || report.Counts["users"] != 1 {
		t.Fatalf("unexpected counts: %+v", report.Counts)
	}

	// Verify bcrypt login works with preserved password_hash.
	srv := api.NewServer(conn, nil)
	u, err := srv.Auth.Authenticate(context.Background(), "owner@home.local", "legacyPass123")
	if err != nil || !u.IsAdmin() {
		t.Fatalf("expected migrated admin login to succeed, user=%+v err=%v", u, err)
	}
	tok, _, _ := srv.Auth.CreateSession(context.Background(), u.ID, auth.SessionKindBearer, "test", "127.0.0.1", time.Hour)

	// Verify legacy QR redirects (/go/i, /go/p, /go/l) all resolve via legacy_uuid!
	h := srv.Handler()
	for _, tc := range []struct {
		path string
		want string
	}{
		{"/go/i/" + itemUUID, "/products/1"},
		{"/go/p/" + prodUUID, "/products/1"},
		{"/go/l/" + childLocUUID, "/locations/1"},
	} {
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusFound || rec.Header().Get("Location") != tc.want {
			t.Fatalf("GET %s expected 302 -> %s, got %d -> %s", tc.path, tc.want, rec.Code, rec.Header().Get("Location"))
		}
	}
}
