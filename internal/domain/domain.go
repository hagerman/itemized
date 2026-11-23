package domain

import (
	"errors"
	"math"
	"time"
)

const DateLayout = "2006-01-02"

var (
	ValidVolumeUnits = map[string]bool{
		"ml": true, "l": true, "tsp": true, "tbsp": true, "fl_oz": true,
		"cup": true, "pt": true, "qt": true, "gal": true,
	}
	ValidWeightUnits = map[string]bool{
		"mg": true, "g": true, "kg": true, "oz": true, "lb": true,
		"t": true, "short_ton": true,
	}
	ValidLengthUnits = map[string]bool{
		"mm": true, "cm": true, "m": true, "km": true,
		"in": true, "ft": true, "yd": true, "mi": true,
	}
)

type Measurement struct {
	VolumeValue *float64 `json:"volume_value"`
	VolumeUnit  *string  `json:"volume_unit"`
	WeightValue *float64 `json:"weight_value"`
	WeightUnit  *string  `json:"weight_unit"`
	LengthValue *float64 `json:"length_value"`
	LengthUnit  *string  `json:"length_unit"`
}

func hasPair(val *float64, unit *string) (present bool, incomplete bool) {
	v := val != nil
	u := unit != nil && *unit != ""
	if v && u {
		return true, false
	}
	if v != u {
		return true, true
	}
	return false, false
}

// ValidateMeasurement ensures at most one of volume, weight, or length is set,
// and that any provided value has a valid matching unit.
func ValidateMeasurement(m Measurement) error {
	volPresent, volInc := hasPair(m.VolumeValue, m.VolumeUnit)
	wtPresent, wtInc := hasPair(m.WeightValue, m.WeightUnit)
	lenPresent, lenInc := hasPair(m.LengthValue, m.LengthUnit)

	if volInc || wtInc || lenInc {
		return errors.New("measurement value and unit must both be provided")
	}

	count := 0
	if volPresent {
		count++
		if !ValidVolumeUnits[*m.VolumeUnit] {
			return errors.New("invalid volume unit")
		}
	}
	if wtPresent {
		count++
		if !ValidWeightUnits[*m.WeightUnit] {
			return errors.New("invalid weight unit")
		}
	}
	if lenPresent {
		count++
		if !ValidLengthUnits[*m.LengthUnit] {
			return errors.New("invalid length unit")
		}
	}
	if count > 1 {
		return errors.New("only one measurement type (volume, weight, or length) may be set")
	}
	return nil
}

// CalculateRollingAverageDueDays computes the rounded mean day offset from recent purchases.
// Returns nil when no offsets exist or the rounded average is not positive.
func CalculateRollingAverageDueDays(recentOffsets []int) *int {
	if len(recentOffsets) == 0 {
		return nil
	}
	sum := 0
	for _, d := range recentOffsets {
		sum += d
	}
	avg := int(math.Round(float64(sum) / float64(len(recentOffsets))))
	if avg <= 0 {
		return nil
	}
	return &avg
}

// CalculatePurchaseDueDate computes the due date for a newly purchased item.
// When useAverage is true and recentOffsets has positive average days, that average is used;
// otherwise defaultDueDays is used. Returns nil when no positive day offset applies.
func CalculatePurchaseDueDate(purchasedOn time.Time, defaultDueDays *int, useAverage bool, recentOffsets []int) *time.Time {
	days := 0
	if useAverage {
		if avg := CalculateRollingAverageDueDays(recentOffsets); avg != nil {
			days = *avg
		}
	}
	if days <= 0 && defaultDueDays != nil && *defaultDueDays > 0 {
		days = *defaultDueDays
	}
	if days <= 0 {
		return nil
	}
	due := purchasedOn.AddDate(0, 0, days)
	return &due
}

// CalculateOpenDueDate returns the updated due date when an item is opened.
// If defaultDueDaysOnOpen is positive, it computes openedOn + days and picks
// the earlier of that date and existingDue (or the computed date if existingDue is nil).
func CalculateOpenDueDate(openedOn time.Time, existingDue *time.Time, defaultDueDaysOnOpen *int) *time.Time {
	if defaultDueDaysOnOpen == nil || *defaultDueDaysOnOpen <= 0 {
		return existingDue
	}
	candidate := openedOn.AddDate(0, 0, *defaultDueDaysOnOpen)
	if existingDue == nil || candidate.Before(*existingDue) {
		return &candidate
	}
	return existingDue
}

// CalculateTransferDueDate returns the updated due date when an item moves between
// freezer and non-freezer locations.
func CalculateTransferDueDate(transferOn time.Time, existingDue *time.Time, fromFreezer, toFreezer bool, freezeDays, thawDays *int) *time.Time {
	if !fromFreezer && toFreezer && freezeDays != nil && *freezeDays > 0 {
		d := transferOn.AddDate(0, 0, *freezeDays)
		return &d
	}
	if fromFreezer && !toFreezer && thawDays != nil && *thawDays > 0 {
		d := transferOn.AddDate(0, 0, *thawDays)
		return &d
	}
	return existingDue
}

func IsLowStock(inStock int, minimumValue *int) bool {
	if minimumValue == nil {
		return false
	}
	return inStock < *minimumValue
}

func LowStockAmount(inStock int, minimumValue *int) *int {
	if !IsLowStock(inStock, minimumValue) {
		return nil
	}
	diff := *minimumValue - inStock
	return &diff
}

func IsOnShoppingList(inStock int, minimumValue *int, manuallyAdded bool) bool {
	return manuallyAdded || IsLowStock(inStock, minimumValue)
}

func IsDueSoon(nextDue *time.Time, today time.Time, withinDays int) bool {
	if nextDue == nil {
		return false
	}
	t := dateOnly(today)
	d := dateOnly(*nextDue)
	end := t.AddDate(0, 0, withinDays)
	return !d.Before(t) && !d.After(end)
}

func IsOverdue(nextDue *time.Time, today time.Time) bool {
	if nextDue == nil {
		return false
	}
	return dateOnly(*nextDue).Before(dateOnly(today))
}

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func ParseDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(DateLayout, s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func FormatDate(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(DateLayout)
	return &s
}
