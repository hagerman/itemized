package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"itemized/internal/db"
)

type starterCategoryNode struct {
	Name     string
	Children []starterCategoryNode
}

type starterLocationNode struct {
	Name      string
	IsFreezer bool
	Children  []starterLocationNode
}

var starterCategories = []starterCategoryNode{
	{
		Name: "Groceries",
		Children: []starterCategoryNode{
			{Name: "Baked Goods"},
			{Name: "Baking Essentials"},
			{Name: "Beer, Wine, & Spirits"},
			{Name: "Beverages"},
			{Name: "Breakfast"},
			{Name: "Canned Goods & Soups"},
			{Name: "Condiments & Sauces"},
			{Name: "Dairy & Eggs"},
			{Name: "Delicatessen"},
			{Name: "Dry Goods, Grains, & Pasta"},
			{Name: "Frozen Foods"},
			{Name: "Herbs & Spices"},
			{Name: "Meat & Seafood"},
			{Name: "Oils & Vinegars"},
			{Name: "Prepared Foods"},
			{Name: "Produce"},
			{Name: "Snacks & Candy"},
		},
	},
	{
		Name: "Household",
		Children: []starterCategoryNode{
			{Name: "Beauty & Personal Care"},
			{Name: "Cleaning Supplies"},
			{Name: "Medical Supplies"},
			{Name: "Office & Craft"},
			{Name: "Paper Goods"},
		},
	},
}

var starterLocations = []starterLocationNode{
	{
		Name: "Kitchen",
		Children: []starterLocationNode{
			{Name: "Pantry"},
			{Name: "Refrigerator"},
			{Name: "Freezer", IsFreezer: true},
			{Name: "Cabinets"},
		},
	},
	{
		Name: "Garage",
		Children: []starterLocationNode{
			{Name: "Chest Freezer", IsFreezer: true},
			{Name: "Storage"},
		},
	},
	{
		Name: "Bathroom",
		Children: []starterLocationNode{
			{Name: "Cabinet"},
		},
	},
	{
		Name: "Laundry",
	},
}

func (s *Server) handleStarterTaxonomy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Categories *bool `json:"categories"`
		Locations  *bool `json:"locations"`
	}

	if r.Body != nil {
		limited := http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
		dec := json.NewDecoder(limited)
		if err := dec.Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
				return
			}
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
	}

	seedCategories := true
	if req.Categories != nil {
		seedCategories = *req.Categories
	}
	seedLocations := true
	if req.Locations != nil {
		seedLocations = *req.Locations
	}

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeInternalError(w, "starter taxonomy begin tx", err)
		return
	}
	defer func() {
		_ = tx.Rollback()
	}()

	now := db.NowUTC()
	categoriesCreated := 0
	locationsCreated := 0

	if seedCategories {
		n, err := seedStarterCategoriesTx(ctx, tx, starterCategories, nil, now)
		if err != nil {
			writeInternalError(w, "seed starter categories", err)
			return
		}
		categoriesCreated = n
	}

	if seedLocations {
		n, err := seedStarterLocationsTx(ctx, tx, starterLocations, nil, now)
		if err != nil {
			writeInternalError(w, "seed starter locations", err)
			return
		}
		locationsCreated = n
	}

	if err := tx.Commit(); err != nil {
		writeInternalError(w, "starter taxonomy commit", err)
		return
	}

	cats, _, err := s.listAllCategories(ctx)
	if err != nil {
		writeInternalError(w, "starter taxonomy list categories", err)
		return
	}
	if cats == nil {
		cats = []Category{}
	}

	locs, _, err := s.listAllLocations(ctx)
	if err != nil {
		writeInternalError(w, "starter taxonomy list locations", err)
		return
	}
	if locs == nil {
		locs = []Location{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"categories_created": categoriesCreated,
		"locations_created":  locationsCreated,
		"categories":         cats,
		"locations":          locs,
	})
}

func seedStarterCategoriesTx(ctx context.Context, tx *sql.Tx, nodes []starterCategoryNode, parentID *int64, now string) (int, error) {
	created := 0
	for _, node := range nodes {
		name := strings.TrimSpace(node.Name)
		id, wasCreated, err := findOrInsertCategoryTx(ctx, tx, name, parentID, now)
		if err != nil {
			return created, err
		}
		if wasCreated {
			created++
		}
		if len(node.Children) > 0 {
			childCreated, err := seedStarterCategoriesTx(ctx, tx, node.Children, &id, now)
			if err != nil {
				return created, err
			}
			created += childCreated
		}
	}
	return created, nil
}

func findOrInsertCategoryTx(ctx context.Context, tx *sql.Tx, name string, parentID *int64, now string) (int64, bool, error) {
	var existingID int64
	var err error
	if parentID == nil {
		err = tx.QueryRowContext(ctx, `
			SELECT id FROM categories
			WHERE parent_id IS NULL AND LOWER(TRIM(name)) = LOWER(?)
			LIMIT 1
		`, name).Scan(&existingID)
	} else {
		err = tx.QueryRowContext(ctx, `
			SELECT id FROM categories
			WHERE parent_id = ? AND LOWER(TRIM(name)) = LOWER(?)
			LIMIT 1
		`, *parentID, name).Scan(&existingID)
	}
	if err == nil {
		return existingID, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}

	res, err := tx.ExecContext(ctx, `
		INSERT INTO categories (name, parent_id, created_at, updated_at)
		VALUES (?, ?, ?, ?)
	`, name, parentID, now, now)
	if err != nil {
		return 0, false, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, false, err
	}
	return id, true, nil
}

func seedStarterLocationsTx(ctx context.Context, tx *sql.Tx, nodes []starterLocationNode, parentID *int64, now string) (int, error) {
	created := 0
	for _, node := range nodes {
		name := strings.TrimSpace(node.Name)
		id, wasCreated, err := findOrInsertLocationTx(ctx, tx, name, parentID, node.IsFreezer, now)
		if err != nil {
			return created, err
		}
		if wasCreated {
			created++
		}
		if len(node.Children) > 0 {
			childCreated, err := seedStarterLocationsTx(ctx, tx, node.Children, &id, now)
			if err != nil {
				return created, err
			}
			created += childCreated
		}
	}
	return created, nil
}

func findOrInsertLocationTx(ctx context.Context, tx *sql.Tx, name string, parentID *int64, isFreezer bool, now string) (int64, bool, error) {
	var existingID int64
	var err error
	if parentID == nil {
		err = tx.QueryRowContext(ctx, `
			SELECT id FROM locations
			WHERE parent_id IS NULL AND LOWER(TRIM(name)) = LOWER(?)
			LIMIT 1
		`, name).Scan(&existingID)
	} else {
		err = tx.QueryRowContext(ctx, `
			SELECT id FROM locations
			WHERE parent_id = ? AND LOWER(TRIM(name)) = LOWER(?)
			LIMIT 1
		`, *parentID, name).Scan(&existingID)
	}
	if err == nil {
		return existingID, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}

	fz := 0
	if isFreezer {
		fz = 1
	}
	res, err := tx.ExecContext(ctx, `
		INSERT INTO locations (name, parent_id, is_freezer, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, name, parentID, fz, now, now)
	if err != nil {
		return 0, false, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, false, err
	}
	return id, true, nil
}
