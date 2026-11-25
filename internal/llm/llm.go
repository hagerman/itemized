package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"itemized/internal/domain"
)

type Config struct {
	Provider string `json:"provider"` // "", "anthropic", "openai", "gemini", "openai-compatible"
	Model    string `json:"model"`
	APIKey   string `json:"api_key"`
	BaseURL  string `json:"base_url"`
}

func (c Config) Enabled() bool {
	return strings.TrimSpace(c.Provider) != "" && strings.TrimSpace(c.Model) != ""
}

type CategoryOption struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type ProductCandidate struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type ClassifyContext struct {
	Description      string             `json:"description,omitempty"`
	ExistingProducts []ProductCandidate `json:"existing_products,omitempty"`
	CommonPrefixes   []string           `json:"common_prefixes,omitempty"`
}

type Classification struct {
	ProductName      string   `json:"product_name"`
	MatchedProductID *int64   `json:"matched_product_id"`
	ProductValue     *float64 `json:"product_value"`
	ProductUnitType  *string  `json:"product_unit_type"`
	ProductUnit      *string  `json:"product_unit"`
	CategoryID       *int64   `json:"category_id"`
}

type ReclassifyInput struct {
	ProductID    int64    `json:"product_id"`
	CurrentName  string   `json:"current_name"`
	VariantNames []string `json:"variant_names,omitempty"`
}

type ReclassifySuggestion struct {
	ProductID     int64  `json:"product_id"`
	CurrentName   string `json:"current_name"`
	SuggestedName string `json:"suggested_name"`
	Error         string `json:"error,omitempty"`
}

type Classifier struct {
	HTTPClient *http.Client
}

func NewClassifier() *Classifier {
	return &Classifier{
		HTTPClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// Classify normalizes a raw UPC title and quantity using the configured LLM provider.
// Returns (nil, nil) when LLM is not configured or upcTitle is empty.
func (c *Classifier) Classify(ctx context.Context, cfg Config, upcTitle, quantity string, categories []CategoryOption) (*Classification, error) {
	return c.ClassifyWithContext(ctx, cfg, upcTitle, quantity, categories, ClassifyContext{})
}

// ClassifyWithContext normalizes a raw UPC title, optional description, and quantity using
// the configured LLM provider alongside household catalog candidates and naming prefixes.
// Returns (nil, nil) when LLM is not configured or upcTitle is empty.
func (c *Classifier) ClassifyWithContext(ctx context.Context, cfg Config, upcTitle, quantity string, categories []CategoryOption, catalogCtx ClassifyContext) (*Classification, error) {
	if !cfg.Enabled() || strings.TrimSpace(upcTitle) == "" {
		return nil, nil
	}

	prompt := buildPromptWithContext(upcTitle, quantity, categories, catalogCtx)

	rawJSON, err := c.invokeProvider(ctx, cfg, prompt, 512)
	if err != nil {
		return nil, err
	}

	rawJSON = extractJSONObject(rawJSON)
	out, err := parseClassificationJSON(rawJSON)
	if err != nil {
		return nil, fmt.Errorf("parse llm json: %w", err)
	}

	// Strictly validate category_id against provided category list.
	if out.CategoryID != nil {
		valid := false
		for _, cat := range categories {
			if cat.ID == *out.CategoryID {
				valid = true
				break
			}
		}
		if !valid {
			out.CategoryID = nil
		}
	}

	// Strictly validate matched_product_id against provided existing product candidates.
	if out.MatchedProductID != nil {
		valid := false
		for _, prod := range catalogCtx.ExistingProducts {
			if prod.ID == *out.MatchedProductID {
				valid = true
				break
			}
		}
		if !valid {
			out.MatchedProductID = nil
		}
	}

	// Strictly validate measurement tuple against canonical domain unit enums.
	if !isValidMeasurementTuple(out.ProductValue, out.ProductUnitType, out.ProductUnit) {
		out.ProductValue = nil
		out.ProductUnitType = nil
		out.ProductUnit = nil
	}

	return &out, nil
}

// ReclassifyNames suggests standardized Item, Variety, Detail names for a batch of existing products.
func (c *Classifier) ReclassifyNames(ctx context.Context, cfg Config, items []ReclassifyInput, existingProducts []ProductCandidate, commonPrefixes []string) ([]ReclassifySuggestion, error) {
	if !cfg.Enabled() {
		return nil, fmt.Errorf("llm classification is not configured")
	}
	if len(items) == 0 {
		return []ReclassifySuggestion{}, nil
	}

	prompt := buildReclassifyPrompt(items, existingProducts, commonPrefixes)
	rawJSON, err := c.invokeProvider(ctx, cfg, prompt, 2048)
	if err != nil {
		return nil, err
	}

	parsedMap, parseErr := parseReclassifyJSON(rawJSON)
	if parseErr != nil {
		if len(items) == 1 {
			return []ReclassifySuggestion{{
				ProductID:     items[0].ProductID,
				CurrentName:   items[0].CurrentName,
				SuggestedName: items[0].CurrentName,
				Error:         "unable to parse suggestion",
			}}, nil
		}
		// Fallback to per-item classification so one malformed batch doesn't lose all suggestions.
		results := make([]ReclassifySuggestion, 0, len(items))
		for _, item := range items {
			single, sErr := c.ReclassifyNames(ctx, cfg, []ReclassifyInput{item}, existingProducts, commonPrefixes)
			if sErr != nil || len(single) == 0 {
				results = append(results, ReclassifySuggestion{
					ProductID:     item.ProductID,
					CurrentName:   item.CurrentName,
					SuggestedName: item.CurrentName,
					Error:         "classification unavailable",
				})
				continue
			}
			results = append(results, single[0])
		}
		return results, nil
	}

	out := make([]ReclassifySuggestion, 0, len(items))
	for _, item := range items {
		suggested := strings.TrimSpace(parsedMap[item.ProductID])
		if suggested == "" {
			out = append(out, ReclassifySuggestion{
				ProductID:     item.ProductID,
				CurrentName:   item.CurrentName,
				SuggestedName: item.CurrentName,
				Error:         "no suggestion returned",
			})
			continue
		}
		out = append(out, ReclassifySuggestion{
			ProductID:     item.ProductID,
			CurrentName:   item.CurrentName,
			SuggestedName: suggested,
		})
	}
	return out, nil
}

func (c *Classifier) invokeProvider(ctx context.Context, cfg Config, prompt string, maxTokens int) (string, error) {
	switch strings.ToLower(strings.TrimSpace(cfg.Provider)) {
	case "anthropic":
		return c.callAnthropic(ctx, cfg, prompt, maxTokens)
	case "gemini":
		return c.callGemini(ctx, cfg, prompt)
	case "openai", "openai-compatible":
		return c.callOpenAI(ctx, cfg, prompt)
	default:
		return "", fmt.Errorf("unsupported llm provider: %s", cfg.Provider)
	}
}

func isValidMeasurementTuple(val *float64, unitType, unit *string) bool {
	if val == nil || unitType == nil || unit == nil {
		return false
	}
	switch *unitType {
	case "volume":
		return domain.ValidVolumeUnits[*unit]
	case "weight":
		return domain.ValidWeightUnits[*unit]
	case "length":
		return domain.ValidLengthUnits[*unit]
	default:
		return false
	}
}

func (c *Classifier) client() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: 60 * time.Second}
}

func (c *Classifier) callOpenAI(ctx context.Context, cfg Config, prompt string) (string, error) {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	payload := map[string]any{
		"model": cfg.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "Return only valid JSON matching the requested schema."},
			{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}
	resp, err := c.client().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("openai api error %s: %s", resp.Status, strings.TrimSpace(string(b)))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("empty openai response")
	}
	return parsed.Choices[0].Message.Content, nil
}

func (c *Classifier) callAnthropic(ctx context.Context, cfg Config, prompt string, maxTokens int) (string, error) {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = "https://api.anthropic.com"
	}
	if maxTokens <= 0 {
		maxTokens = 512
	}
	payload := map[string]any{
		"model":      cfg.Model,
		"max_tokens": maxTokens,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", cfg.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.client().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("anthropic api error %s: %s", resp.Status, strings.TrimSpace(string(b)))
	}
	var parsed struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if len(parsed.Content) == 0 {
		return "", fmt.Errorf("empty anthropic response")
	}
	return parsed.Content[0].Text, nil
}

func (c *Classifier) callGemini(ctx context.Context, cfg Config, prompt string) (string, error) {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = "https://generativelanguage.googleapis.com"
	}
	endpoint := fmt.Sprintf("%s/v1beta/models/%s:generateContent", base, cfg.Model)
	payload := map[string]any{
		"contents": []map[string]any{
			{"parts": []map[string]string{{"text": prompt}}},
		},
		"generationConfig": map[string]any{
			"responseMimeType": "application/json",
		},
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" {
		req.Header.Set("x-goog-api-key", cfg.APIKey)
	}

	resp, err := c.client().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("gemini api error %s: %s", resp.Status, strings.TrimSpace(string(b)))
	}
	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("empty gemini response")
	}
	return parsed.Candidates[0].Content.Parts[0].Text, nil
}

func parseClassificationJSON(rawJSON string) (Classification, error) {
	var raw struct {
		ProductName      string          `json:"product_name"`
		MatchedProductID json.RawMessage `json:"matched_product_id"`
		ProductValue     json.RawMessage `json:"product_value"`
		ProductUnitType  *string         `json:"product_unit_type"`
		ProductUnit      *string         `json:"product_unit"`
		CategoryID       json.RawMessage `json:"category_id"`
	}
	if err := json.Unmarshal([]byte(rawJSON), &raw); err != nil {
		return Classification{}, err
	}
	out := Classification{
		ProductName:     strings.TrimSpace(raw.ProductName),
		ProductUnitType: raw.ProductUnitType,
		ProductUnit:     raw.ProductUnit,
	}
	if id, ok := parseFlexibleInt64(raw.MatchedProductID); ok {
		out.MatchedProductID = &id
	}
	if v, ok := parseFlexibleFloat(raw.ProductValue); ok {
		out.ProductValue = &v
	}
	if id, ok := parseFlexibleInt64(raw.CategoryID); ok {
		out.CategoryID = &id
	}
	return out, nil
}

type rawReclassifyEntry struct {
	ProductID     json.RawMessage `json:"product_id"`
	SuggestedName string          `json:"suggested_name"`
	ProductName   string          `json:"product_name"`
}

func parseReclassifyJSON(raw string) (map[int64]string, error) {
	cleaned := strings.TrimSpace(raw)
	if idx := strings.Index(cleaned, "```"); idx >= 0 {
		rest := cleaned[idx+3:]
		if nl := strings.Index(rest, "\n"); nl >= 0 {
			rest = rest[nl+1:]
		}
		if endFence := strings.Index(rest, "```"); endFence >= 0 {
			cleaned = strings.TrimSpace(rest[:endFence])
		}
	}

	var entries []rawReclassifyEntry
	// Try wrapper object {"items": [...]} or {"suggestions": [...]}
	objStr := extractJSONObject(cleaned)
	var wrapper struct {
		Items       []rawReclassifyEntry `json:"items"`
		Suggestions []rawReclassifyEntry `json:"suggestions"`
	}
	if err := json.Unmarshal([]byte(objStr), &wrapper); err == nil && (len(wrapper.Items) > 0 || len(wrapper.Suggestions) > 0) {
		if len(wrapper.Items) > 0 {
			entries = wrapper.Items
		} else {
			entries = wrapper.Suggestions
		}
	} else {
		// Fallback to bare JSON array [...]
		start := strings.Index(cleaned, "[")
		end := strings.LastIndex(cleaned, "]")
		if start < 0 || end <= start {
			return nil, fmt.Errorf("no json array found in reclassify response")
		}
		if err := json.Unmarshal([]byte(cleaned[start:end+1]), &entries); err != nil {
			return nil, err
		}
	}

	result := make(map[int64]string, len(entries))
	for _, e := range entries {
		id, ok := parseFlexibleInt64(e.ProductID)
		if !ok {
			continue
		}
		name := strings.TrimSpace(e.SuggestedName)
		if name == "" {
			name = strings.TrimSpace(e.ProductName)
		}
		if name != "" {
			result[id] = name
		}
	}
	if len(result) == 0 {
		return nil, fmt.Errorf("empty reclassify suggestions")
	}
	return result, nil
}

func parseFlexibleFloat(raw json.RawMessage) (float64, bool) {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0, false
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return f, true
	}
	var str string
	if err := json.Unmarshal(raw, &str); err == nil {
		if f, err := strconv.ParseFloat(strings.TrimSpace(str), 64); err == nil {
			return f, true
		}
	}
	return 0, false
}

func parseFlexibleInt64(raw json.RawMessage) (int64, bool) {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0, false
	}
	var n int64
	if err := json.Unmarshal(raw, &n); err == nil {
		return n, true
	}
	var str string
	if err := json.Unmarshal(raw, &str); err == nil {
		if n, err := strconv.ParseInt(strings.TrimSpace(str), 10, 64); err == nil {
			return n, true
		}
	}
	return 0, false
}

func extractJSONObject(s string) string {
	s = strings.TrimSpace(s)
	if idx := strings.Index(s, "```"); idx >= 0 {
		rest := s[idx+3:]
		if nl := strings.Index(rest, "\n"); nl >= 0 {
			rest = rest[nl+1:]
		}
		if endFence := strings.Index(rest, "```"); endFence >= 0 {
			s = strings.TrimSpace(rest[:endFence])
		}
	}
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}

const namingConventionRules = `Naming rules for standardized generic product names:
- Format: comma-inverted Title Case "Item", "Item, Variety", or "Item, Variety, Detail" (no brand, store, size, weight, or packaging).
- Start with the concrete base item noun, NEVER a broad catalog category prefix like "Meat,", "Produce,", "Bakery,", "Beverage,", "Snack,", or "Prepared Foods," (category is tracked separately).
- Prefer plural for countable items (e.g., "Apples", "Beans", "Peppers", "Chips", "Cookies") and singular for uncountable/mass nouns (e.g., "Milk", "Cheese", "Chicken", "Flour", "Mustard", "Spinach").
- Mirror established prefixes from the household's common catalog prefixes when applicable.
- Examples:
  * "Kirkland Signature Organic Gala Apples" -> "Apples, Gala"
  * "Burman's Dijon Mustard" -> "Mustard, Dijon"
  * "Publix Organic Baby Spinach" -> "Spinach, Baby"
  * "Perdue Boneless Skinless Chicken Breasts" -> "Chicken, Breast"
  * "Bush's Seasoned Black Beans" -> "Beans, Black, Seasoned"`

func buildPrompt(title, quantity string, categories []CategoryOption) string {
	return buildPromptWithContext(title, quantity, categories, ClassifyContext{})
}

func buildPromptWithContext(title, quantity string, categories []CategoryOption, catalogCtx ClassifyContext) string {
	catsJSON, _ := json.Marshal(categories)
	existingJSON, _ := json.Marshal(catalogCtx.ExistingProducts)
	prefixesJSON, _ := json.Marshal(catalogCtx.CommonPrefixes)
	return fmt.Sprintf(`You are a household inventory product classifier and quantity normalizer. Return a single JSON object with keys:
- "matched_product_id": integer ID from the provided existing_products list if one already represents the exact same generic product (e.g., a different brand or package size of the same item), otherwise null
- "product_name": standardized generic product name following the naming rules below (always populate this, even when matched_product_id is set)
- "product_value": numeric total quantity or null
- "product_unit_type": MUST be one of the exact strings "volume", "weight", "length", or null
- "product_unit": MUST be one of the exact enum strings matching "product_unit_type" (never display text like "fl oz", "liters", or "pounds"):
  - for "volume": "ml", "l", "tsp", "tbsp", "fl_oz", "cup", "pt", "qt", "gal"
  - for "weight": "mg", "g", "kg", "oz", "lb", "t", "short_ton"
  - for "length": "mm", "cm", "m", "km", "in", "ft", "yd", "mi"
  - or null if no measurement applies
- "category_id": integer ID from the provided categories list if obvious match, otherwise null

%s

Product title: %s
Product description: %s
Product quantity: %s
Existing catalog products (match if same generic item): %s
Common catalog prefixes: %s
Categories: %s`, namingConventionRules, title, catalogCtx.Description, quantity, string(existingJSON), string(prefixesJSON), string(catsJSON))
}

func buildReclassifyPrompt(items []ReclassifyInput, existingProducts []ProductCandidate, commonPrefixes []string) string {
	itemsJSON, _ := json.Marshal(items)
	existingJSON, _ := json.Marshal(existingProducts)
	prefixesJSON, _ := json.Marshal(commonPrefixes)
	return fmt.Sprintf(`You are standardizing product names in a household inventory catalog. Return a single JSON object with key "items": an array of objects, one for each input product, each with keys:
- "product_id": exact integer ID from the input
- "suggested_name": standardized generic product name following the naming rules below

%s
- If an input product represents the same generic item as an existing catalog product (or another product in the input batch), give them the exact same "suggested_name" so they can be merged.
- Keep names concise and clean; if a product's current_name already follows the rules well, return it unchanged.

Existing catalog products for reference: %s
Common catalog prefixes: %s
Products to standardize: %s`, namingConventionRules, string(existingJSON), string(prefixesJSON), string(itemsJSON))
}
