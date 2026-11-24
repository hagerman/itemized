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

func TestNormalizeRawTCPEndpoint(t *testing.T) {
	valid := []struct {
		in   string
		want string
	}{
		{"192.168.1.102:9100", "192.168.1.102:9100"},
		{"192.168.1.102", "192.168.1.102:9100"},
		{"  192.168.1.102:9101  ", "192.168.1.102:9101"},
		{"192.168.1.102:9100/", "192.168.1.102:9100"},
		{"printer.local", "printer.local:9100"},
		{"http://192.168.1.102:9100", "192.168.1.102:9100"},
		{"http://192.168.1.102", "192.168.1.102:9100"},
		{"https://printer.local:9101/path?x=1", "printer.local:9101"},
		{"tcp://192.168.1.102:9100", "192.168.1.102:9100"},
		{"socket://192.168.1.102:9100/", "192.168.1.102:9100"},
		{"::1", "[::1]:9100"},
		{"[::1]", "[::1]:9100"},
		{"[::1]:9100", "[::1]:9100"},
		{"http://[::1]:9100", "[::1]:9100"},
	}
	for _, tc := range valid {
		got, err := NormalizeRawTCPEndpoint(tc.in)
		if err != nil {
			t.Errorf("NormalizeRawTCPEndpoint(%q) unexpected error: %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("NormalizeRawTCPEndpoint(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}

	invalid := []string{
		"",
		"   ",
		"http://",
		"http://:9100",
		":9100",
		"192.168.1.102:0",
		"192.168.1.102:99999",
		"192.168.1.102:abc",
		"http://192.168.1.102:99999",
		"http://192.168.1.102:abc",
		"192.168.1.102:9100:extra",
		"[::1",
		"bad host:9100",
	}
	for _, in := range invalid {
		if got, err := NormalizeRawTCPEndpoint(in); err == nil {
			t.Errorf("NormalizeRawTCPEndpoint(%q) = %q, want error", in, got)
		}
	}
}

func TestRawTCPDriverNormalizesEndpointOnDial(t *testing.T) {
	var dialedAddr string
	clientConn, serverConn := net.Pipe()
	go func() {
		defer serverConn.Close()
		_, _ = io.ReadAll(serverConn)
	}()

	drv := &RawTCPDriver{
		DialContext: func(_ context.Context, _, addr string) (net.Conn, error) {
			dialedAddr = addr
			return clientConn, nil
		},
	}
	if err := drv.Print(context.Background(), "http://192.168.1.102:9100", []byte("^XA^XZ")); err != nil {
		t.Fatalf("RawTCPDriver.Print with URL endpoint failed: %v", err)
	}
	if dialedAddr != "192.168.1.102:9100" {
		t.Fatalf("dialed %q, want %q", dialedAddr, "192.168.1.102:9100")
	}

	if err := drv.Print(context.Background(), "http://", []byte("^XA^XZ")); err == nil {
		t.Fatalf("expected error for invalid raw tcp endpoint")
	}
}
