package domain

import (
	"testing"
	"time"
)

func intPtr(v int) *int          { return &v }
func floatPtr(v float64) *float64 { return &v }
func strPtr(v string) *string    { return &v }

func TestValidateMeasurement(t *testing.T) {
	cases := []struct {
		name    string
		m       Measurement
		wantErr bool
	}{
		{"empty", Measurement{}, false},
		{"valid volume", Measurement{VolumeValue: floatPtr(16), VolumeUnit: strPtr("fl_oz")}, false},
		{"valid weight", Measurement{WeightValue: floatPtr(500), WeightUnit: strPtr("g")}, false},
		{"valid length", Measurement{LengthValue: floatPtr(10), LengthUnit: strPtr("m")}, false},
		{"multiple types", Measurement{
			VolumeValue: floatPtr(1), VolumeUnit: strPtr("l"),
			WeightValue: floatPtr(1), WeightUnit: strPtr("kg"),
		}, true},
		{"missing unit", Measurement{VolumeValue: floatPtr(12)}, true},
		{"invalid unit", Measurement{WeightValue: floatPtr(12), WeightUnit: strPtr("bushels")}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateMeasurement(tc.m)
			if (err != nil) != tc.wantErr {
				t.Fatalf("ValidateMeasurement() err=%v wantErr=%v", err, tc.wantErr)
			}
		})
	}
}

func TestDueDateCalculations(t *testing.T) {
	base := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	// Average takes precedence when enabled and positive.
	due := CalculatePurchaseDueDate(base, intPtr(14), true, []int{10, 12, 8})
	if due == nil || due.Format(DateLayout) != "2026-06-11" {
		t.Fatalf("expected 2026-06-11, got %v", due)
	}

	// Falls back to default when no offsets.
	due = CalculatePurchaseDueDate(base, intPtr(14), true, nil)
	if due == nil || due.Format(DateLayout) != "2026-06-15" {
		t.Fatalf("expected 2026-06-15, got %v", due)
	}

	// Opening shortens due date when earlier.
	existing := time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC)
	opened := CalculateOpenDueDate(base, &existing, intPtr(5))
	if opened == nil || opened.Format(DateLayout) != "2026-06-06" {
		t.Fatalf("expected 2026-06-06, got %v", opened)
	}

	// Opening keeps existing due date if existing is already earlier.
	earlier := time.Date(2026, 6, 3, 0, 0, 0, 0, time.UTC)
	opened = CalculateOpenDueDate(base, &earlier, intPtr(5))
	if opened == nil || opened.Format(DateLayout) != "2026-06-03" {
		t.Fatalf("expected 2026-06-03, got %v", opened)
	}

	// Freezing and thawing.
	frozen := CalculateTransferDueDate(base, &earlier, false, true, intPtr(90), intPtr(3))
	if frozen == nil || frozen.Format(DateLayout) != "2026-08-30" {
		t.Fatalf("expected 2026-08-30 on freeze, got %v", frozen)
	}
	thawed := CalculateTransferDueDate(base, frozen, true, false, intPtr(90), intPtr(3))
	if thawed == nil || thawed.Format(DateLayout) != "2026-06-04" {
		t.Fatalf("expected 2026-06-04 on thaw, got %v", thawed)
	}
}

func TestShoppingListAndDuePredicates(t *testing.T) {
	today := time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC)

	if !IsOnShoppingList(1, intPtr(2), false) {
		t.Fatalf("expected low stock product on shopping list")
	}
	if amt := LowStockAmount(1, intPtr(2)); amt == nil || *amt != 1 {
		t.Fatalf("expected shortage 1, got %v", amt)
	}
	if !IsOnShoppingList(5, intPtr(2), true) {
		t.Fatalf("expected manually added product on shopping list")
	}
	if IsOnShoppingList(2, intPtr(2), false) {
		t.Fatalf("did not expect sufficient stock product on shopping list")
	}

	yesterday := time.Date(2026, 6, 9, 0, 0, 0, 0, time.UTC)
	if !IsOverdue(&yesterday, today) {
		t.Fatalf("expected yesterday to be overdue")
	}
	inFiveDays := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	if !IsDueSoon(&inFiveDays, today, 7) {
		t.Fatalf("expected +5 days to be due soon")
	}
}
