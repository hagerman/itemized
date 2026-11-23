package upc

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const DefaultOpenFoodFactsURL = "https://world.openfoodfacts.org"

type LookupResult struct {
	Barcode     string `json:"barcode"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Measurement string `json:"measurement,omitempty"`
}

type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewClient() *Client {
	return &Client{
		BaseURL: DefaultOpenFoodFactsURL,
		HTTPClient: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

type offResponse struct {
	Status  int `json:"status"`
	Product struct {
		ProductName string `json:"product_name"`
		Brands      string `json:"brands"`
		GenericName string `json:"generic_name"`
		Quantity    string `json:"quantity"`
		Categories  string `json:"categories"`
	} `json:"product"`
}

// Lookup queries OpenFoodFacts for the given retail barcode.
// Returns (nil, nil) when the barcode is not found.
func (c *Client) Lookup(ctx context.Context, barcode string) (*LookupResult, error) {
	barcode = strings.TrimSpace(barcode)
	if barcode == "" {
		return nil, nil
	}
	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		base = DefaultOpenFoodFactsURL
	}
	endpoint := fmt.Sprintf("%s/api/v2/product/%s.json", base, url.PathEscape(barcode))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Itemized/1.0 (self-hosted inventory)")

	httpClient := c.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 8 * time.Second}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("openfoodfacts returned %s", resp.Status)
	}

	var parsed offResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	if parsed.Status != 1 {
		return nil, nil
	}

	title := strings.TrimSpace(parsed.Product.ProductName)
	brands := strings.TrimSpace(parsed.Product.Brands)
	if brands != "" && title != "" && !strings.Contains(strings.ToLower(title), strings.ToLower(brands)) {
		title = brands + " " + title
	} else if title == "" {
		title = brands
	}
	if title == "" {
		return nil, nil
	}

	desc := strings.TrimSpace(parsed.Product.GenericName)
	if desc == "" {
		desc = strings.TrimSpace(parsed.Product.Categories)
	}

	return &LookupResult{
		Barcode:     barcode,
		Title:       title,
		Description: desc,
		Measurement: strings.TrimSpace(parsed.Product.Quantity),
	}, nil
}
