package upc

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestOpenFoodFactsLookup(t *testing.T) {
	httpClient := &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			switch r.URL.Path {
			case "/api/v2/product/012345678905.json":
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"status": 1,
						"product": {
							"product_name": "Whole Cashews",
							"brands": "Planters",
							"generic_name": "Roasted cashews",
							"quantity": "16 oz"
						}
					}`)),
				}, nil
			case "/api/v2/product/000000000000.json":
				return &http.Response{
					StatusCode: http.StatusNotFound,
					Body:       io.NopCloser(strings.NewReader(`{"status":0}`)),
				}, nil
			default:
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Status:     "500 Internal Server Error",
					Body:       io.NopCloser(strings.NewReader(`error`)),
				}, nil
			}
		}),
	}

	client := &Client{BaseURL: "https://off.test", HTTPClient: httpClient}

	res, err := client.Lookup(context.Background(), "012345678905")
	if err != nil {
		t.Fatalf("Lookup failed: %v", err)
	}
	if res == nil || res.Title != "Planters Whole Cashews" || res.Measurement != "16 oz" {
		t.Fatalf("unexpected lookup result: %+v", res)
	}

	missing, err := client.Lookup(context.Background(), "000000000000")
	if err != nil || missing != nil {
		t.Fatalf("expected (nil, nil) on 404, got (%+v, %v)", missing, err)
	}

	if _, err := client.Lookup(context.Background(), "999999999999"); err == nil {
		t.Fatalf("expected error on 500")
	}
}
