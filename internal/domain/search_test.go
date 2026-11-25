package domain

import (
	"reflect"
	"testing"
)

func TestNormalizeSearchQuery(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"Chicken, Popcorn, Fried", "Chicken Popcorn Fried"},
		{"  Nuts, Cashews, Whole!  ", "Nuts Cashews Whole"},
		{",,,---...", ""},
		{"   ", ""},
		{"2% Milk (Organic)", "2 Milk Organic"},
	}
	for _, tc := range tests {
		if got := NormalizeSearchQuery(tc.in); got != tc.want {
			t.Errorf("NormalizeSearchQuery(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestBarcodeQueryAndCandidates(t *testing.T) {
	if !IsBarcodeQuery("012345678905") {
		t.Fatalf("expected 12-digit UPC to be barcode query")
	}
	if !IsBarcodeQuery("0012345678905") {
		t.Fatalf("expected 13-digit EAN to be barcode query")
	}
	if IsBarcodeQuery("1234567") {
		t.Fatalf("expected 7 digits not to be barcode query")
	}
	if IsBarcodeQuery("123456789012345") {
		t.Fatalf("expected 15 digits not to be barcode query")
	}
	if IsBarcodeQuery("12345678a") {
		t.Fatalf("expected alphanumeric not to be barcode query")
	}

	got13 := BarcodeCandidates("0012345678905")
	want13 := []string{"0012345678905", "012345678905"}
	if !reflect.DeepEqual(got13, want13) {
		t.Fatalf("BarcodeCandidates(13-digit leading 0) = %v, want %v", got13, want13)
	}

	got12 := BarcodeCandidates("012345678905")
	want12 := []string{"012345678905"}
	if !reflect.DeepEqual(got12, want12) {
		t.Fatalf("BarcodeCandidates(12-digit) = %v, want %v", got12, want12)
	}

	if gotNon := BarcodeCandidates("milk"); gotNon != nil {
		t.Fatalf("BarcodeCandidates(non-barcode) = %v, want nil", gotNon)
	}
}

func TestMatchProductSearch(t *testing.T) {
	tests := []struct {
		name      string
		product   string
		query     string
		wantMatch bool
		wantTier  int
	}{
		{"exact normalized match", "Milk", "milk", true, MatchTierExact},
		{"prefix match", "Chicken, Popcorn, Fried", "chick", true, MatchTierPrefix},
		{"whole word match", "Almond Milk, Unsweetened", "milk", true, MatchTierWholeWord},
		{"reordered words without punctuation", "Chicken, Popcorn, Fried", "Fried Chicken Popcorn", true, MatchTierWholeWord},
		{"multi-word order-independent keywords", "Nuts, Cashews, Whole", "whole nuts", true, MatchTierWholeWord},
		{"partial substring", "Nuts, Cashews, Whole", "cash", true, MatchTierSubstring},
		{"suffix substring", "Buttermilk", "milk", true, MatchTierSubstring},
		{"short 2-char prefix", "Milk", "mi", true, MatchTierPrefix},
		{"extra descriptive details", "Chicken, Popcorn, Fried", "Chicken, Popcorn, Fried, Original", true, MatchTierFuzzy},
		{"typo via trigram similarity", "Cashews", "Cashewz", true, MatchTierFuzzy},
		{"typo against multi-word product name", "Chicken, Popcorn, Fried", "chiken", true, MatchTierFuzzy},
		{"multi-word query with typo", "Chicken, Popcorn, Fried", "fried chiken", true, MatchTierFuzzy},
		{"punctuation-only query", "Milk", ",,,---", false, MatchTierNone},
		{"unrelated query", "Nuts, Cashews, Whole", "Laundry Detergent", false, MatchTierNone},
		{"short 2-char non-match does not fuzzy match", "Chicken, Popcorn, Fried", "zz", false, MatchTierNone},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			clean := NormalizeSearchQuery(tc.query)
			kws := SearchKeywords(clean)
			res := MatchProductSearch(tc.product, clean, kws)
			if res.Matched != tc.wantMatch || res.Tier != tc.wantTier {
				t.Fatalf("MatchProductSearch(%q, %q) = %+v, want matched=%v tier=%d", tc.product, tc.query, res, tc.wantMatch, tc.wantTier)
			}
		})
	}
}

func TestTrigramSimilarityOrdering(t *testing.T) {
	q := NormalizeSearchQuery("Milk")
	exactSim := TrigramSimilarity("Milk", q)
	longerSim := TrigramSimilarity("Almond Milk, Unsweetened", q)
	if exactSim <= longerSim {
		t.Fatalf("expected exact match similarity (%.3f) > longer name similarity (%.3f)", exactSim, longerSim)
	}
	if reordered := TrigramSimilarity("Chicken, Popcorn, Fried", NormalizeSearchQuery("Fried Chicken Popcorn")); reordered != 1.0 {
		t.Fatalf("expected identical word set in different order to have similarity 1.0, got %.3f", reordered)
	}
}
