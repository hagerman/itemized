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

type Classification struct {
	ProductName     string   `json:"product_name"`
	ProductValue    *float64 `json:"product_value"`
	ProductUnitType *string  `json:"product_unit_type"`
	ProductUnit     *string  `json:"product_unit"`
	CategoryID      *int64   `json:"category_id"`
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
	if !cfg.Enabled() || strings.TrimSpace(upcTitle) == "" {
		return nil, nil
	}

	prompt := buildPrompt(upcTitle, quantity, categories)

	var rawJSON string
	var err error
	switch strings.ToLower(strings.TrimSpace(cfg.Provider)) {
	case "anthropic":
		rawJSON, err = c.callAnthropic(ctx, cfg, prompt)
	case "gemini":
		rawJSON, err = c.callGemini(ctx, cfg, prompt)
	case "openai", "openai-compatible":
		rawJSON, err = c.callOpenAI(ctx, cfg, prompt)
	default:
		return nil, fmt.Errorf("unsupported llm provider: %s", cfg.Provider)
	}
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

	// Strictly validate measurement tuple against canonical domain unit enums.
	if !isValidMeasurementTuple(out.ProductValue, out.ProductUnitType, out.ProductUnit) {
		out.ProductValue = nil
		out.ProductUnitType = nil
		out.ProductUnit = nil
	}

	return &out, nil
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

func (c *Classifier) callAnthropic(ctx context.Context, cfg Config, prompt string) (string, error) {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = "https://api.anthropic.com"
	}
	payload := map[string]any{
		"model":      cfg.Model,
		"max_tokens": 512,
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
		ProductName     string          `json:"product_name"`
		ProductValue    json.RawMessage `json:"product_value"`
		ProductUnitType *string         `json:"product_unit_type"`
		ProductUnit     *string         `json:"product_unit"`
		CategoryID      json.RawMessage `json:"category_id"`
	}
	if err := json.Unmarshal([]byte(rawJSON), &raw); err != nil {
		return Classification{}, err
	}
	out := Classification{
		ProductName:     strings.TrimSpace(raw.ProductName),
		ProductUnitType: raw.ProductUnitType,
		ProductUnit:     raw.ProductUnit,
	}
	if v, ok := parseFlexibleFloat(raw.ProductValue); ok {
		out.ProductValue = &v
	}
	if id, ok := parseFlexibleInt64(raw.CategoryID); ok {
		out.CategoryID = &id
	}
	return out, nil
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

func buildPrompt(title, quantity string, categories []CategoryOption) string {
	catsJSON, _ := json.Marshal(categories)
	return fmt.Sprintf(`You are a product classifier and quantity normalizer. Return a single JSON object with keys:
- "product_name": standardized generic Title Case name (no brand, size, or packaging), format "Category", "Category, Specification", or "Category, Specification, Detail"
- "product_value": numeric total quantity or null
- "product_unit_type": MUST be one of the exact strings "volume", "weight", "length", or null
- "product_unit": MUST be one of the exact enum strings matching "product_unit_type" (never display text like "fl oz", "liters", or "pounds"):
  - for "volume": "ml", "l", "tsp", "tbsp", "fl_oz", "cup", "pt", "qt", "gal"
  - for "weight": "mg", "g", "kg", "oz", "lb", "t", "short_ton"
  - for "length": "mm", "cm", "m", "km", "in", "ft", "yd", "mi"
  - or null if no measurement applies
- "category_id": integer ID from the provided categories list if obvious match, otherwise null

Product description: %s
Product quantity: %s
Categories: %s`, title, quantity, string(catsJSON))
}
