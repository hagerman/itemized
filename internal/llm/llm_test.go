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
