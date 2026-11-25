package demo

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	// DemoAdminEmail is the email address of the seeded demo administrator account.
	DemoAdminEmail = "demo@itemizedapp.com"
	// DefaultResetInterval is the default interval between automatic demo resets.
	DefaultResetInterval = time.Hour

	// Non-usable placeholder hash; password login is disabled in demo mode.
	demoDisabledPasswordHash = "$2a$10$demo.disabled.password.hash.placeholder0000000000000000000"
	dateLayout               = "2006-01-02"
)

// Seed populates a clean database transaction with a realistic household inventory
// dataset whose item dates are computed relative to now (UTC).
func Seed(ctx context.Context, tx *sql.Tx, now time.Time) error {
	nowUTC := now.UTC()
	nowStr := nowUTC.Format(time.RFC3339)
	today := time.Date(nowUTC.Year(), nowUTC.Month(), nowUTC.Day(), 0, 0, 0, 0, time.UTC)
	dateOffset := func(days int) string {
		return today.AddDate(0, 0, days).Format(dateLayout)
	}
	intPtr := func(v int) *int { return &v }
	floatPtr := func(v float64) *float64 { return &v }
	strPtr := func(v string) *string { return &v }

	// 1. Users
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (email, password_hash, role, created_at, updated_at)
		VALUES (?, ?, 'admin', ?, ?), (?, ?, 'member', ?, ?)
	`, DemoAdminEmail, demoDisabledPasswordHash, nowStr, nowStr,
		"chris@itemizedapp.com", demoDisabledPasswordHash, nowStr, nowStr); err != nil {
		return fmt.Errorf("seed users: %w", err)
	}

	// 2. Settings
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO settings (key, value, updated_at) VALUES ('due_date_average_count', '3', ?)
	`, nowStr); err != nil {
		return fmt.Errorf("seed settings: %w", err)
	}

	// 3. Locations (hierarchical, including freezers)
	insertLocation := func(name string, parentID *int64, isFreezer bool) (int64, error) {
		fz := 0
		if isFreezer {
			fz = 1
		}
		res, err := tx.ExecContext(ctx, `
			INSERT INTO locations (name, parent_id, is_freezer, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`, name, parentID, fz, nowStr, nowStr)
		if err != nil {
			return 0, fmt.Errorf("seed location %q: %w", name, err)
		}
		return res.LastInsertId()
	}

	kitchenID, err := insertLocation("Kitchen", nil, false)
	if err != nil {
		return err
	}
	pantryID, err := insertLocation("Pantry", &kitchenID, false)
	if err != nil {
		return err
	}
	fridgeID, err := insertLocation("Refrigerator", &kitchenID, false)
	if err != nil {
		return err
	}
	crisperID, err := insertLocation("Crisper Drawer", &fridgeID, false)
	if err != nil {
		return err
	}
	freezerID, err := insertLocation("Freezer", &kitchenID, true)
	if err != nil {
		return err
	}
	garageID, err := insertLocation("Garage", nil, false)
	if err != nil {
		return err
	}
	chestFreezerID, err := insertLocation("Chest Freezer", &garageID, true)
	if err != nil {
		return err
	}
	storageShelfID, err := insertLocation("Storage Shelf", &garageID, false)
	if err != nil {
		return err
	}

	// 4. Categories (hierarchical)
	insertCategory := func(name string, parentID *int64) (int64, error) {
		res, err := tx.ExecContext(ctx, `
			INSERT INTO categories (name, parent_id, created_at, updated_at)
			VALUES (?, ?, ?, ?)
		`, name, parentID, nowStr, nowStr)
		if err != nil {
			return 0, fmt.Errorf("seed category %q: %w", name, err)
		}
		return res.LastInsertId()
	}

	foodID, err := insertCategory("Food", nil)
	if err != nil {
		return err
	}
	pantryCatID, err := insertCategory("Pantry Staples", &foodID)
	if err != nil {
		return err
	}
	dairyCatID, err := insertCategory("Dairy & Eggs", &foodID)
	if err != nil {
		return err
	}
	produceCatID, err := insertCategory("Produce", &foodID)
	if err != nil {
		return err
	}
	frozenCatID, err := insertCategory("Frozen", &foodID)
	if err != nil {
		return err
	}
	beveragesCatID, err := insertCategory("Beverages", nil)
	if err != nil {
		return err
	}
	householdCatID, err := insertCategory("Household", nil)
	if err != nil {
		return err
	}
	cleaningCatID, err := insertCategory("Cleaning", &householdCatID)
	if err != nil {
		return err
	}
	paperCatID, err := insertCategory("Paper Goods", &householdCatID)
	if err != nil {
		return err
	}

	// 5. Products, Variants, Barcodes, Items
	type productSeed struct {
		name           string
		categoryID     int64
		defaultLocID   int64
		dueDays        *int
		dueDaysOpen    *int
		dueDaysFreeze  *int
		dueDaysThaw    *int
		useAvgDue      bool
		labelPrintMode string
		minValue       *int
		manualShop     bool
		volVal         *float64
		volUnit        *string
		wtVal          *float64
		wtUnit         *string
	}

	insertProduct := func(p productSeed) (int64, error) {
		mode := p.labelPrintMode
		if mode == "" {
			mode = "per_item"
		}
		useAvg := 0
		if p.useAvgDue {
			useAvg = 1
		}
		manualShop := 0
		if p.manualShop {
			manualShop = 1
		}
		res, err := tx.ExecContext(ctx, `
			INSERT INTO products (
				name, category_id, default_location_id,
				default_due_days, default_due_days_on_open, default_due_days_on_freeze, default_due_days_on_thaw,
				use_average_for_due_date, label_print_mode, minimum_value, manually_added_to_shopping_list,
				volume_value, volume_unit, weight_value, weight_unit,
				created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, p.name, p.categoryID, p.defaultLocID,
			p.dueDays, p.dueDaysOpen, p.dueDaysFreeze, p.dueDaysThaw,
			useAvg, mode, p.minValue, manualShop,
			p.volVal, p.volUnit, p.wtVal, p.wtUnit,
			nowStr, nowStr)
		if err != nil {
			return 0, fmt.Errorf("seed product %q: %w", p.name, err)
		}
		return res.LastInsertId()
	}

	insertVariant := func(productID int64, name string, volVal *float64, volUnit *string, wtVal *float64, wtUnit *string) (int64, error) {
		res, err := tx.ExecContext(ctx, `
			INSERT INTO variants (product_id, name, volume_value, volume_unit, weight_value, weight_unit, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, productID, name, volVal, volUnit, wtVal, wtUnit, nowStr, nowStr)
		if err != nil {
			return 0, fmt.Errorf("seed variant %q: %w", name, err)
		}
		return res.LastInsertId()
	}

	insertBarcode := func(variantID int64, code string, defaultQty int) error {
		if defaultQty <= 0 {
			defaultQty = 1
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO barcodes (variant_id, barcode, default_quantity, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`, variantID, code, defaultQty, nowStr, nowStr)
		if err != nil {
			return fmt.Errorf("seed barcode %q: %w", code, err)
		}
		return nil
	}

	type itemSeed struct {
		productID int64
		variantID *int64
		locID     int64
		purchased *string
		opened    *string
		due       *string
		consumed  *string
		notes     *string
	}

	insertItem := func(it itemSeed) error {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO items (product_id, variant_id, location_id, purchased_on_date, opened_on_date, due_on_date, consumed_on_date, notes, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, it.productID, it.variantID, it.locID, it.purchased, it.opened, it.due, it.consumed, it.notes, nowStr, nowStr)
		if err != nil {
			return fmt.Errorf("seed item for product %d: %w", it.productID, err)
		}
		return nil
	}

	// Whole Milk: Due Soon + Opened + Consumed history for rolling-average due date
	milkID, err := insertProduct(productSeed{
		name: "Whole Milk", categoryID: dairyCatID, defaultLocID: fridgeID,
		dueDays: intPtr(10), dueDaysOpen: intPtr(5), useAvgDue: true, minValue: intPtr(1),
		volVal: floatPtr(1), volUnit: strPtr("gal"),
	})
	if err != nil {
		return err
	}
	milkVarID, err := insertVariant(milkID, "1 Gallon Jug", floatPtr(1), strPtr("gal"), nil, nil)
	if err != nil {
		return err
	}
	if err := insertBarcode(milkVarID, "004190007561", 1); err != nil {
		return err
	}
	for _, it := range []itemSeed{
		{productID: milkID, variantID: &milkVarID, locID: fridgeID, purchased: strPtr(dateOffset(-6)), opened: strPtr(dateOffset(-3)), due: strPtr(dateOffset(2))},
		{productID: milkID, variantID: &milkVarID, locID: fridgeID, purchased: strPtr(dateOffset(-36)), due: strPtr(dateOffset(-26)), consumed: strPtr(dateOffset(-28))},
		{productID: milkID, variantID: &milkVarID, locID: fridgeID, purchased: strPtr(dateOffset(-26)), due: strPtr(dateOffset(-16)), consumed: strPtr(dateOffset(-17))},
		{productID: milkID, variantID: &milkVarID, locID: fridgeID, purchased: strPtr(dateOffset(-16)), due: strPtr(dateOffset(-6)), consumed: strPtr(dateOffset(-8))},
	} {
		if err := insertItem(it); err != nil {
			return err
		}
	}

	// Baby Spinach: Due Soon
	spinachID, err := insertProduct(productSeed{
		name: "Baby Spinach", categoryID: produceCatID, defaultLocID: crisperID,
		dueDays: intPtr(7), wtVal: floatPtr(5), wtUnit: strPtr("oz"),
	})
	if err != nil {
		return err
	}
	if err := insertItem(itemSeed{
		productID: spinachID, locID: crisperID,
		purchased: strPtr(dateOffset(-4)), due: strPtr(dateOffset(3)),
	}); err != nil {
		return err
	}

	// Greek Yogurt: Due Soon + Opened
	yogurtID, err := insertProduct(productSeed{
		name: "Greek Yogurt", categoryID: dairyCatID, defaultLocID: fridgeID,
		dueDays: intPtr(14), dueDaysOpen: intPtr(7), wtVal: floatPtr(32), wtUnit: strPtr("oz"),
	})
	if err != nil {
		return err
	}
	yogurtVarID, err := insertVariant(yogurtID, "Plain 32 oz Tub", nil, nil, floatPtr(32), strPtr("oz"))
	if err != nil {
		return err
	}
	if err := insertBarcode(yogurtVarID, "089470001004", 1); err != nil {
		return err
	}
	if err := insertItem(itemSeed{
		productID: yogurtID, variantID: &yogurtVarID, locID: fridgeID,
		purchased: strPtr(dateOffset(-9)), opened: strPtr(dateOffset(-5)), due: strPtr(dateOffset(2)),
	}); err != nil {
		return err
	}

	// Chicken Stock: 1 Overdue + Opened in Fridge, 2 In Stock in Pantry
	stockID, err := insertProduct(productSeed{
		name: "Chicken Stock", categoryID: pantryCatID, defaultLocID: pantryID,
		dueDays: intPtr(180), dueDaysOpen: intPtr(4), volVal: floatPtr(32), volUnit: strPtr("fl oz"),
	})
	if err != nil {
		return err
	}
	stockVarID, err := insertVariant(stockID, "Low Sodium 32 oz Carton", floatPtr(32), strPtr("fl oz"), nil, nil)
	if err != nil {
		return err
	}
	if err := insertBarcode(stockVarID, "005100001251", 1); err != nil {
		return err
	}
	for _, it := range []itemSeed{
		{productID: stockID, variantID: &stockVarID, locID: fridgeID, purchased: strPtr(dateOffset(-20)), opened: strPtr(dateOffset(-7)), due: strPtr(dateOffset(-3)), notes: strPtr("Opened for weeknight soup")},
		{productID: stockID, variantID: &stockVarID, locID: pantryID, purchased: strPtr(dateOffset(-20)), due: strPtr(dateOffset(160))},
		{productID: stockID, variantID: &stockVarID, locID: pantryID, purchased: strPtr(dateOffset(-20)), due: strPtr(dateOffset(160))},
	} {
		if err := insertItem(it); err != nil {
			return err
		}
	}

	// Fresh Salsa: Overdue + Opened
	salsaID, err := insertProduct(productSeed{
		name: "Fresh Salsa", categoryID: produceCatID, defaultLocID: fridgeID,
		dueDays: intPtr(10), dueDaysOpen: intPtr(5), wtVal: floatPtr(16), wtUnit: strPtr("oz"),
	})
	if err != nil {
		return err
	}
	if err := insertItem(itemSeed{
		productID: salsaID, locID: fridgeID,
		purchased: strPtr(dateOffset(-12)), opened: strPtr(dateOffset(-7)), due: strPtr(dateOffset(-2)),
	}); err != nil {
		return err
	}

	// Whole Grain Pasta: In Stock with 2 variants & barcodes
	pastaID, err := insertProduct(productSeed{
		name: "Whole Grain Pasta", categoryID: pantryCatID, defaultLocID: pantryID,
		dueDays: intPtr(365), wtVal: floatPtr(16), wtUnit: strPtr("oz"),
	})
	if err != nil {
		return err
	}
	penneVarID, err := insertVariant(pastaID, "Penne 16 oz Box", nil, nil, floatPtr(16), strPtr("oz"))
	if err != nil {
		return err
	}
	spaghettiVarID, err := insertVariant(pastaID, "Spaghetti 16 oz Box", nil, nil, floatPtr(16), strPtr("oz"))
	if err != nil {
		return err
	}
	if err := insertBarcode(penneVarID, "007680828009", 1); err != nil {
		return err
	}
	if err := insertBarcode(spaghettiVarID, "007680828008", 1); err != nil {
		return err
	}
	for _, vid := range []int64{penneVarID, penneVarID, spaghettiVarID} {
		v := vid
		if err := insertItem(itemSeed{
			productID: pastaID, variantID: &v, locID: pantryID,
			purchased: strPtr(dateOffset(-15)), due: strPtr(dateOffset(350)),
		}); err != nil {
			return err
		}
	}

	// Extra Virgin Olive Oil: In Stock + Opened
	oliveOilID, err := insertProduct(productSeed{
		name: "Extra Virgin Olive Oil", categoryID: pantryCatID, defaultLocID: pantryID,
		dueDays: intPtr(365), volVal: floatPtr(750), volUnit: strPtr("ml"),
	})
	if err != nil {
		return err
	}
	if err := insertItem(itemSeed{
		productID: oliveOilID, locID: pantryID,
		purchased: strPtr(dateOffset(-40)), opened: strPtr(dateOffset(-30)), due: strPtr(dateOffset(325)),
	}); err != nil {
		return err
	}

	// Black Beans: In Stock
	beansID, err := insertProduct(productSeed{
		name: "Black Beans", categoryID: pantryCatID, defaultLocID: pantryID,
		dueDays: intPtr(730), wtVal: floatPtr(15), wtUnit: strPtr("oz"),
	})
	if err != nil {
		return err
	}
	beansVarID, err := insertVariant(beansID, "15 oz Can", nil, nil, floatPtr(15), strPtr("oz"))
	if err != nil {
		return err
	}
	if err := insertBarcode(beansVarID, "003940001614", 1); err != nil {
		return err
	}
	for i := 0; i < 4; i++ {
		if err := insertItem(itemSeed{
			productID: beansID, variantID: &beansVarID, locID: pantryID,
			purchased: strPtr(dateOffset(-30)), due: strPtr(dateOffset(700)),
		}); err != nil {
			return err
		}
	}

	// Mixed Berries: In Stock in Kitchen Freezer
	berriesID, err := insertProduct(productSeed{
		name: "Mixed Berries", categoryID: frozenCatID, defaultLocID: freezerID,
		dueDays: intPtr(180), dueDaysFreeze: intPtr(180), dueDaysThaw: intPtr(3),
		wtVal: floatPtr(48), wtUnit: strPtr("oz"),
	})
	if err != nil {
		return err
	}
	for i := 0; i < 2; i++ {
		if err := insertItem(itemSeed{
			productID: berriesID, locID: freezerID,
			purchased: strPtr(dateOffset(-25)), due: strPtr(dateOffset(155)),
		}); err != nil {
			return err
		}
	}

	// Ground Beef: In Stock in Garage Chest Freezer
	beefID, err := insertProduct(productSeed{
		name: "Ground Beef", categoryID: frozenCatID, defaultLocID: chestFreezerID,
		dueDays: intPtr(4), dueDaysFreeze: intPtr(120), dueDaysThaw: intPtr(2),
		wtVal: floatPtr(1), wtUnit: strPtr("lb"),
	})
	if err != nil {
		return err
	}
	for i := 0; i < 3; i++ {
		if err := insertItem(itemSeed{
			productID: beefID, locID: chestFreezerID,
			purchased: strPtr(dateOffset(-14)), due: strPtr(dateOffset(106)),
			notes: strPtr("Vacuum sealed 1 lb pack"),
		}); err != nil {
			return err
		}
	}

	// Paper Towels: Low Stock -> Shopping List
	paperTowelsID, err := insertProduct(productSeed{
		name: "Paper Towels", categoryID: paperCatID, defaultLocID: storageShelfID,
		labelPrintMode: "none", minValue: intPtr(2),
	})
	if err != nil {
		return err
	}
	if err := insertItem(itemSeed{
		productID: paperTowelsID, locID: storageShelfID,
		purchased: strPtr(dateOffset(-10)),
	}); err != nil {
		return err
	}

	// Sparkling Water: Low Stock -> Shopping List (with multi-pack barcode)
	waterID, err := insertProduct(productSeed{
		name: "Sparkling Water", categoryID: beveragesCatID, defaultLocID: pantryID,
		dueDays: intPtr(180), minValue: intPtr(4), volVal: floatPtr(12), volUnit: strPtr("fl oz"),
	})
	if err != nil {
		return err
	}
	waterVarID, err := insertVariant(waterID, "Lime 12-Pack", floatPtr(12), strPtr("fl oz"), nil, nil)
	if err != nil {
		return err
	}
	if err := insertBarcode(waterVarID, "001299310101", 12); err != nil {
		return err
	}
	for i := 0; i < 2; i++ {
		if err := insertItem(itemSeed{
			productID: waterID, variantID: &waterVarID, locID: pantryID,
			purchased: strPtr(dateOffset(-12)), due: strPtr(dateOffset(168)),
		}); err != nil {
			return err
		}
	}

	// Whole Bean Coffee: Manually added to Shopping List
	coffeeID, err := insertProduct(productSeed{
		name: "Whole Bean Coffee", categoryID: beveragesCatID, defaultLocID: pantryID,
		dueDays: intPtr(90), manualShop: true, wtVal: floatPtr(12), wtUnit: strPtr("oz"),
	})
	if err != nil {
		return err
	}
	if err := insertItem(itemSeed{
		productID: coffeeID, locID: pantryID,
		purchased: strPtr(dateOffset(-14)), opened: strPtr(dateOffset(-10)), due: strPtr(dateOffset(76)),
	}); err != nil {
		return err
	}

	// Dish Soap: In Stock
	soapID, err := insertProduct(productSeed{
		name: "Dish Soap", categoryID: cleaningCatID, defaultLocID: kitchenID,
		labelPrintMode: "none", volVal: floatPtr(24), volUnit: strPtr("fl oz"),
	})
	if err != nil {
		return err
	}
	for i := 0; i < 2; i++ {
		if err := insertItem(itemSeed{
			productID: soapID, locID: kitchenID,
			purchased: strPtr(dateOffset(-20)),
		}); err != nil {
			return err
		}
	}

	// 6. Sample disabled printer
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO printers (name, description, driver, endpoint, printer_model, enabled, created_at, updated_at)
		VALUES (?, ?, 'ipp_zpl', ?, ?, 0, ?, ?)
	`, "Kitchen Zebra ZSB", "Sample LAN label printer (printing disabled in demo mode)",
		"http://192.168.1.50:631/ipp/print", "Zebra ZSB", nowStr, nowStr); err != nil {
		return fmt.Errorf("seed printer: %w", err)
	}

	return nil
}
