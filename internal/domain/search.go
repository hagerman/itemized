package domain

import (
	"strings"
	"unicode"
)

const (
	// TrigramSimilarityThreshold matches PostgreSQL pg_trgm's default similarity threshold (0.3).
	TrigramSimilarityThreshold = 0.3

	// WordSimilarityThreshold is the minimum per-word trigram similarity required for a
	// single misspelled query token (>= 3 runes) to match a word inside a multi-word product name.
	WordSimilarityThreshold = 0.4
)

// Match tier constants ordered from strongest (5) to weakest (1).
const (
	MatchTierNone      = 0
	MatchTierFuzzy     = 1
	MatchTierSubstring = 2
	MatchTierWholeWord = 3
	MatchTierPrefix    = 4
	MatchTierExact     = 5
)

// SearchMatch captures whether a product matched a search query along with its relevance tier
// and trigram similarity score for ranking.
type SearchMatch struct {
	Matched    bool
	Tier       int
	Similarity float64
}

// NormalizeSearchQuery strips punctuation (retaining letters, digits, underscores, and whitespace)
// and trims surrounding whitespace, mirroring legacy Ruby `q.gsub(/[^\w\s\d]/, "").strip`.
func NormalizeSearchQuery(q string) string {
	var b strings.Builder
	b.Grow(len(q))
	for _, r := range q {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || unicode.IsSpace(r) {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

// SearchKeywords splits a normalized search query into lowercase whitespace-separated keywords.
func SearchKeywords(cleanQuery string) []string {
	return strings.Fields(strings.ToLower(cleanQuery))
}

// IsBarcodeQuery reports whether q (trimmed) is an 8 to 14 digit numeric retail barcode.
func IsBarcodeQuery(q string) bool {
	s := strings.TrimSpace(q)
	if len(s) < 8 || len(s) > 14 {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// BarcodeCandidates returns barcode lookup candidates for an 8 to 14 digit query,
// including the 12-digit UPC-A form when given a 13-digit EAN-13 starting with '0'.
func BarcodeCandidates(q string) []string {
	s := strings.TrimSpace(q)
	if !IsBarcodeQuery(s) {
		return nil
	}
	if len(s) == 13 && s[0] == '0' {
		return []string{s, s[1:]}
	}
	return []string{s}
}

func extractWords(s string) []string {
	var words []string
	var cur []rune
	flush := func() {
		if len(cur) > 0 {
			words = append(words, string(cur))
			cur = cur[:0]
		}
	}
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			cur = append(cur, r)
		} else {
			flush()
		}
	}
	flush()
	return words
}

// Trigrams extracts the deduplicated set of PostgreSQL pg_trgm-compatible trigrams from s.
// Each alphanumeric word is lowercased, padded with two leading spaces and one trailing space,
// and sliced into 3-rune windows.
func Trigrams(s string) map[string]struct{} {
	set := make(map[string]struct{})
	for _, w := range extractWords(s) {
		word := []rune(w)
		padded := make([]rune, 0, len(word)+3)
		padded = append(padded, ' ', ' ')
		padded = append(padded, word...)
		padded = append(padded, ' ')
		for i := 0; i+3 <= len(padded); i++ {
			set[string(padded[i:i+3])] = struct{}{}
		}
	}
	return set
}

// TrigramSimilarity computes the Jaccard similarity of the pg_trgm trigram sets of a and b.
func TrigramSimilarity(a, b string) float64 {
	ta := Trigrams(a)
	tb := Trigrams(b)
	if len(ta) == 0 && len(tb) == 0 {
		return 0
	}
	// Iterate over the smaller set for intersection.
	small, large := ta, tb
	if len(tb) < len(ta) {
		small, large = tb, ta
	}
	inter := 0
	for tg := range small {
		if _, ok := large[tg]; ok {
			inter++
		}
	}
	union := len(ta) + len(tb) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

// MatchProductSearch evaluates whether product name matches cleanQuery/keywords and assigns
// a relevance tier (Exact > Prefix > WholeWord > Substring > Fuzzy) plus trigram similarity.
//
// A product matches if any of the following hold:
//   - All whitespace-separated query keywords appear as case-insensitive substrings of name.
//   - Full-string trigram similarity >= TrigramSimilarityThreshold (0.3).
//   - Every query keyword matches either as a substring or (for keywords >= 3 runes) via
//     per-word trigram similarity >= WordSimilarityThreshold (0.4) against a word in name.
func MatchProductSearch(name, cleanQuery string, keywords []string) SearchMatch {
	if cleanQuery == "" || len(keywords) == 0 {
		return SearchMatch{}
	}

	sim := TrigramSimilarity(name, cleanQuery)
	lowerName := strings.ToLower(name)
	nameWords := extractWords(name)
	normName := strings.Join(nameWords, " ")
	normQuery := strings.Join(keywords, " ")

	// Tier 5: Exact normalized match
	if normName == normQuery {
		return SearchMatch{Matched: true, Tier: MatchTierExact, Similarity: sim}
	}

	// Tier 4: Prefix match on raw or normalized product name
	if strings.HasPrefix(lowerName, normQuery) || strings.HasPrefix(normName, normQuery) {
		return SearchMatch{Matched: true, Tier: MatchTierPrefix, Similarity: sim}
	}

	// Check whole-word and substring keyword matches
	wordSet := make(map[string]struct{}, len(nameWords))
	for _, w := range nameWords {
		wordSet[w] = struct{}{}
	}
	allWholeWords := true
	allSubstrings := true
	for _, kw := range keywords {
		if _, ok := wordSet[kw]; !ok {
			allWholeWords = false
		}
		if !strings.Contains(lowerName, kw) {
			allSubstrings = false
		}
	}
	if allWholeWords {
		return SearchMatch{Matched: true, Tier: MatchTierWholeWord, Similarity: sim}
	}
	if allSubstrings {
		return SearchMatch{Matched: true, Tier: MatchTierSubstring, Similarity: sim}
	}

	// Tier 1: Full-string trigram similarity
	if sim >= TrigramSimilarityThreshold {
		return SearchMatch{Matched: true, Tier: MatchTierFuzzy, Similarity: sim}
	}

	// Tier 1: Per-word typo tolerance (every keyword matches as substring or word trigram >= 0.4)
	allWordFuzzy := true
	for _, kw := range keywords {
		if strings.Contains(lowerName, kw) {
			continue
		}
		if len([]rune(kw)) < 3 {
			allWordFuzzy = false
			break
		}
		best := 0.0
		for _, w := range nameWords {
			if ws := TrigramSimilarity(w, kw); ws > best {
				best = ws
			}
		}
		if best < WordSimilarityThreshold {
			allWordFuzzy = false
			break
		}
	}
	if allWordFuzzy {
		return SearchMatch{Matched: true, Tier: MatchTierFuzzy, Similarity: sim}
	}

	return SearchMatch{Matched: false, Tier: MatchTierNone, Similarity: sim}
}
