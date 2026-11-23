package printer

import (
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestRenderAndDrivers(t *testing.T) {
	svc := NewService()

	payload := LabelPayload{
		EntityType:  EntityItem,
		ItemID:      42,
		ProductName: "Milk, Whole",
		Barcode:     "https://itemized.local/go/i/42",
		DueOnDate:   "2026-07-01",
	}

	zpl, err := svc.Render(EntityItem, "", payload, "na_label_2.25x1in")
	if err != nil {
		t.Fatalf("Render default item template: %v", err)
	}
	out := string(zpl)
	if !strings.Contains(out, "https://itemized.local/go/i/42") || !strings.Contains(out, "Milk, Whole") || !strings.Contains(out, "2026-07-01") {
		t.Fatalf("unexpected rendered ZPL:\n%s", out)
	}

	// Test RawTCPDriver using in-memory net.Pipe.
	clientConn, serverConn := net.Pipe()
	received := make(chan string, 1)
	go func() {
		defer serverConn.Close()
		b, _ := io.ReadAll(serverConn)
		received <- string(b)
	}()

	svc.RegisterDriver(DriverRawTCPZPL, &RawTCPDriver{
		DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
			return clientConn, nil
		},
	})
	err = svc.Print(context.Background(), PrinterConfig{
		Driver:   DriverRawTCPZPL,
		Endpoint: "192.168.1.50",
		Enabled:  true,
	}, EntityItem, "", payload)
	if err != nil {
		t.Fatalf("RawTCP Print failed: %v", err)
	}
	gotTCP := <-received
	if !strings.Contains(gotTCP, "^XA") || !strings.Contains(gotTCP, "Milk, Whole") {
		t.Fatalf("unexpected TCP ZPL payload: %s", gotTCP)
	}

	// Test IPPDriver using in-process RoundTripper.
	var ippRequests int
	var gotBody string
	svc.RegisterDriver(DriverIPPZPL, &IPPDriver{
		HTTPClient: &http.Client{
			Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				ippRequests++
				b, _ := io.ReadAll(r.Body)
				if strings.Contains(string(b), "^XA") {
					gotBody = string(b)
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader("")),
				}, nil
			}),
		},
	})

	err = svc.Print(context.Background(), PrinterConfig{
		Driver:   DriverIPPZPL,
		Endpoint: "http://printer.local:631/ipp/print",
		Enabled:  true,
	}, EntityItem, "^XA^FDCustom:{{.Payload.ProductName}}^FS^XZ", payload)
	if err != nil {
		t.Fatalf("IPP Print failed: %v", err)
	}
	if ippRequests < 1 || !strings.Contains(gotBody, "Custom:Milk, Whole") {
		t.Fatalf("expected IPP print job with custom template, requests=%d body=%q", ippRequests, gotBody)
	}
}
