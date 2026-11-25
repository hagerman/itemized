package llm

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestClassifierUnconfiguredAndOpenAICompat(t *testing.T) {
	c := NewClassifier()

	// Unconfigured returns (nil, nil) gracefully.
	res, err := c.Classify(context.Background(), Config{}, "Planters Cashews", "16 oz", nil)
	if err != nil || res != nil {
		t.Fatalf("expected (nil, nil) when unconfigured, got (%+v, %v)", res, err)
	}

	var callNum int
	c.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			callNum++
			body := `{"choices":[{"message":{"content":"{\"product_name\":\"Nuts, Cashews, Whole\",\"product_value\":16,\"product_unit_type\":\"weight\",\"product_unit\":\"oz\",\"category_id\":42}"}}]}`
			if callNum == 2 {
				body = `{"choices":[{"message":{"content":"{\"product_name\":\"Nuts, Cashews, Whole\",\"product_value\":16,\"product_unit_type\":\"weight\",\"product_unit\":\"oz\",\"category_id\":999}"}}]}`
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}

	cfg := Config{Provider: "openai-compatible", Model: "llama3.2", BaseURL: "http://ollama.test/v1"}
	cats := []CategoryOption{{ID: 42, Name: "Snacks"}}

	got, err := c.Classify(context.Background(), cfg, "Planters Cashews", "16 oz", cats)
	if err != nil {
		t.Fatalf("Classify failed: %v", err)
	}
	if got.ProductName != "Nuts, Cashews, Whole" || got.CategoryID == nil || *got.CategoryID != 42 {
		t.Fatalf("unexpected classification: %+v", got)
	}

	// Invented category_id (999) must be coerced to nil.
	got2, err := c.Classify(context.Background(), cfg, "Planters Cashews", "16 oz", cats)
	if err != nil {
		t.Fatalf("second Classify failed: %v", err)
	}
	if got2.CategoryID != nil {
		t.Fatalf("expected invented category_id to be nil, got %v", *got2.CategoryID)
	}
}

func TestClassifierUnitValidationAndPrompt(t *testing.T) {
	prompt := buildPrompt("Pepsi Cola", "67.63 fl oz", nil)
	for _, want := range []string{`"fl_oz"`, `"short_ton"`, `"volume"`, `"weight"`, `"length"`} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("expected prompt to contain canonical token %s", want)
		}
	}

	responses := []string{
		// Valid canonical volume unit
		`{"choices":[{"message":{"content":"{\"product_name\":\"Soda, Cola\",\"product_value\":67.63,\"product_unit_type\":\"volume\",\"product_unit\":\"fl_oz\",\"category_id\":null}"}}]}`,
		// Non-canonical unit string ("fl oz" with space) -> coerced to nil
		`{"choices":[{"message":{"content":"{\"product_name\":\"Soda, Cola\",\"product_value\":67.63,\"product_unit_type\":\"volume\",\"product_unit\":\"fl oz\",\"category_id\":null}"}}]}`,
		// Mismatched unit type (volume with weight unit "oz") -> coerced to nil
		`{"choices":[{"message":{"content":"{\"product_name\":\"Soda, Cola\",\"product_value\":12,\"product_unit_type\":\"volume\",\"product_unit\":\"oz\",\"category_id\":null}"}}]}`,
	}
	idx := 0
	c := NewClassifier()
	c.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body := responses[idx]
			idx++
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}
	cfg := Config{Provider: "openai-compatible", Model: "llama3.2", BaseURL: "http://ollama.test/v1"}

	got1, err := c.Classify(context.Background(), cfg, "Pepsi Cola", "67.63 fl oz", nil)
	if err != nil {
		t.Fatalf("Classify 1 failed: %v", err)
	}
	if got1.ProductValue == nil || *got1.ProductValue != 67.63 || got1.ProductUnitType == nil || *got1.ProductUnitType != "volume" || got1.ProductUnit == nil || *got1.ProductUnit != "fl_oz" {
		t.Fatalf("expected valid canonical measurement preserved, got %+v", got1)
	}

	got2, err := c.Classify(context.Background(), cfg, "Pepsi Cola", "67.63 fl oz", nil)
	if err != nil {
		t.Fatalf("Classify 2 failed: %v", err)
	}
	if got2.ProductValue != nil || got2.ProductUnitType != nil || got2.ProductUnit != nil {
		t.Fatalf("expected non-canonical unit coerced to nil, got %+v", got2)
	}

	got3, err := c.Classify(context.Background(), cfg, "Pepsi Cola", "12 oz", nil)
	if err != nil {
		t.Fatalf("Classify 3 failed: %v", err)
	}
	if got3.ProductValue != nil || got3.ProductUnitType != nil || got3.ProductUnit != nil {
		t.Fatalf("expected mismatched unit type coerced to nil, got %+v", got3)
	}
}

func TestClassifierFlexibleJSONParsing(t *testing.T) {
	c := NewClassifier()
	c.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			// Markdown fence + stringified product_value and category_id
			body := `{"choices":[{"message":{"content":"Here is the result:\n` + "```json\\n" + `{\"product_name\":\"Soda, Cola\",\"product_value\":\"67.63\",\"product_unit_type\":\"volume\",\"product_unit\":\"fl_oz\",\"category_id\":\"7\"}` + "\\n```" + `"}}]}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}
	cfg := Config{Provider: "openai-compatible", Model: "llama3.2", BaseURL: "http://ollama.test/v1"}
	got, err := c.Classify(context.Background(), cfg, "Pepsi Cola", "67.63 fl oz", []CategoryOption{{ID: 7, Name: "Beverages"}})
	if err != nil {
		t.Fatalf("Classify failed: %v", err)
	}
	if got.ProductName != "Soda, Cola" || got.ProductValue == nil || *got.ProductValue != 67.63 || got.CategoryID == nil || *got.CategoryID != 7 {
		t.Fatalf("unexpected flexible parse result: %+v", got)
	}
}

func TestClassifierGeminiUsesHeaderAuth(t *testing.T) {
	c := NewClassifier()
	var capturedURL string
	var capturedHeader string
	c.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			capturedURL = r.URL.String()
			capturedHeader = r.Header.Get("x-goog-api-key")
			body := `{"candidates":[{"content":{"parts":[{"text":"{\"product_name\":\"Milk, Whole\",\"product_value\":1,\"product_unit_type\":\"volume\",\"product_unit\":\"gal\",\"category_id\":null}"}]}}]}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}

	cfg := Config{
		Provider: "gemini",
		Model:    "gemini-2.5-flash",
		APIKey:   "super-secret-gemini-key",
		BaseURL:  "https://gemini.test",
	}
	got, err := c.Classify(context.Background(), cfg, "Horizon Whole Milk", "1 gal", nil)
	if err != nil {
		t.Fatalf("Classify gemini failed: %v", err)
	}
	if got == nil || got.ProductName != "Milk, Whole" {
		t.Fatalf("unexpected gemini classification: %+v", got)
	}
	if strings.Contains(capturedURL, "key=") || strings.Contains(capturedURL, "super-secret-gemini-key") {
		t.Fatalf("expected API key NOT in request URL, got %q", capturedURL)
	}
	if capturedHeader != "super-secret-gemini-key" {
		t.Fatalf("expected x-goog-api-key header, got %q", capturedHeader)
	}
}

func TestClassifierCatalogContextAndMatchedProductValidation(t *testing.T) {
	ctx := ClassifyContext{
		Description: "Organic dijon mustard condiment",
		ExistingProducts: []ProductCandidate{
			{ID: 10, Name: "Mustard, Dijon"},
			{ID: 11, Name: "Mustard, Yellow"},
		},
		CommonPrefixes: []string{"Apples", "Mustard", "Cheese"},
	}
	prompt := buildPromptWithContext("Burman's Dijon Mustard", "12 oz", []CategoryOption{{ID: 1, Name: "Condiments"}}, ctx)
	for _, want := range []string{
		"Item, Variety, Detail",
		"NEVER a broad catalog category prefix",
		"Organic dijon mustard condiment",
		"Mustard, Dijon",
		`"Apples"`,
		`"matched_product_id"`,
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("expected prompt to contain %q", want)
		}
	}

	responses := []string{
		`{"choices":[{"message":{"content":"{\"matched_product_id\":10,\"product_name\":\"Mustard, Dijon\",\"product_value\":12,\"product_unit_type\":\"weight\",\"product_unit\":\"oz\",\"category_id\":1}"}}]}`,
		`{"choices":[{"message":{"content":"{\"matched_product_id\":999,\"product_name\":\"Mustard, Spicy Brown\",\"product_value\":null,\"product_unit_type\":null,\"product_unit\":null,\"category_id\":null}"}}]}`,
	}
	idx := 0
	c := NewClassifier()
	c.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body := responses[idx]
			idx++
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}
	cfg := Config{Provider: "openai-compatible", Model: "llama3.2", BaseURL: "http://ollama.test/v1"}

	got1, err := c.ClassifyWithContext(context.Background(), cfg, "Burman's Dijon Mustard", "12 oz", []CategoryOption{{ID: 1, Name: "Condiments"}}, ctx)
	if err != nil {
		t.Fatalf("ClassifyWithContext 1 failed: %v", err)
	}
	if got1.MatchedProductID == nil || *got1.MatchedProductID != 10 {
		t.Fatalf("expected matched_product_id=10, got %+v", got1)
	}

	got2, err := c.ClassifyWithContext(context.Background(), cfg, "Gulden's Spicy Brown Mustard", "12 oz", nil, ctx)
	if err != nil {
		t.Fatalf("ClassifyWithContext 2 failed: %v", err)
	}
	if got2.MatchedProductID != nil {
		t.Fatalf("expected invalid matched_product_id to be nil, got %v", *got2.MatchedProductID)
	}
	if got2.ProductName != "Mustard, Spicy Brown" {
		t.Fatalf("unexpected product name: %q", got2.ProductName)
	}
}

func TestReclassifyNamesBatchAndFallback(t *testing.T) {
	c := NewClassifier()
	if _, err := c.ReclassifyNames(context.Background(), Config{}, []ReclassifyInput{{ProductID: 1, CurrentName: "Apple, Gala"}}, nil, nil); err == nil {
		t.Fatalf("expected error when LLM is unconfigured")
	}

	cfg := Config{Provider: "openai-compatible", Model: "llama3.2", BaseURL: "http://ollama.test/v1"}
	inputs := []ReclassifyInput{
		{ProductID: 1, CurrentName: "Apple, Gala", VariantNames: []string{"Organic Gala Apples"}},
		{ProductID: 2, CurrentName: "Meat, Chicken, Breast", VariantNames: []string{"Perdue Chicken Breasts"}},
	}

	// Batch JSON wrapper response
	c.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body := `{"choices":[{"message":{"content":"{\"items\":[{\"product_id\":1,\"suggested_name\":\"Apples, Gala\"},{\"product_id\":\"2\",\"suggested_name\":\"Chicken, Breast\"}]}"}}]}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}
	got, err := c.ReclassifyNames(context.Background(), cfg, inputs, []ProductCandidate{{ID: 9, Name: "Chicken, Breast"}}, []string{"Apples", "Chicken"})
	if err != nil {
		t.Fatalf("ReclassifyNames batch failed: %v", err)
	}
	if len(got) != 2 || got[0].SuggestedName != "Apples, Gala" || got[1].SuggestedName != "Chicken, Breast" {
		t.Fatalf("unexpected batch suggestions: %+v", got)
	}

	// Malformed batch response falls back to per-item calls
	callCount := 0
	c.HTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			callCount++
			var content string
			switch callCount {
			case 1:
				content = "not valid json"
			case 2:
				content = `[{"product_id":1,"suggested_name":"Apples, Gala"}]`
			default:
				content = `{"items":[{"product_id":2,"suggested_name":"Chicken, Breast"}]}`
			}
			body := `{"choices":[{"message":{"content":` + strings.ReplaceAll(strings.ReplaceAll(`"`+strings.ReplaceAll(content, `"`, `\"`)+`"`, "\n", ""), "\r", "") + `}}]}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(body)),
			}, nil
		}),
	}
	gotFallback, err := c.ReclassifyNames(context.Background(), cfg, inputs, nil, nil)
	if err != nil {
		t.Fatalf("ReclassifyNames fallback failed: %v", err)
	}
	if len(gotFallback) != 2 || gotFallback[0].SuggestedName != "Apples, Gala" || gotFallback[1].SuggestedName != "Chicken, Breast" {
		t.Fatalf("unexpected fallback suggestions: %+v", gotFallback)
	}
}
