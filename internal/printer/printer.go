package printer

import (
	"bytes"
	"context"
	"embed"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/OpenPrinting/goipp"
)

//go:embed templates/*.zpl
var defaultTemplatesFS embed.FS

const (
	DriverIPPZPL    = "ipp_zpl"
	DriverRawTCPZPL = "raw_tcp_zpl"

	EntityItem     = "item"
	EntityProduct  = "product"
	EntityLocation = "location"
)

type LabelPayload struct {
	EntityType         string    `json:"entity_type"`
	ItemID             int64     `json:"item_id,omitempty"`
	ProductID          int64     `json:"product_id,omitempty"`
	LocationID         int64     `json:"location_id,omitempty"`
	ProductName        string    `json:"product_name,omitempty"`
	LocationName       string    `json:"location_name,omitempty"`
	ParentLocationName string    `json:"parent_location_name,omitempty"`
	CategoryName       string    `json:"category_name,omitempty"`
	IsFreezer          bool      `json:"is_freezer,omitempty"`
	Barcode            string    `json:"barcode"`
	Quantity           int       `json:"quantity,omitempty"`
	PurchasedOnDate    string    `json:"purchased_on_date,omitempty"`
	DueOnDate          string    `json:"due_on_date,omitempty"`
	PurchasedDate      time.Time `json:"-"`
	DueDate            time.Time `json:"-"`
}

type PrinterConfig struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Driver   string `json:"driver"`
	Endpoint string `json:"endpoint"`
	Enabled  bool   `json:"enabled"`
}

type Driver interface {
	Print(ctx context.Context, endpoint string, zpl []byte) error
	MediaReady(ctx context.Context, endpoint string) (string, error)
}

type IPPDriver struct {
	HTTPClient *http.Client
}

func (d *IPPDriver) client() *http.Client {
	if d.HTTPClient != nil {
		return d.HTTPClient
	}
	return &http.Client{Timeout: 5 * time.Second}
}

func (d *IPPDriver) Print(ctx context.Context, endpoint string, zpl []byte) error {
	req := goipp.NewRequest(goipp.DefaultVersion, goipp.OpPrintJob, 1)
	req.Operation.Add(goipp.MakeAttribute("attributes-charset", goipp.TagCharset, goipp.String("utf-8")))
	req.Operation.Add(goipp.MakeAttribute("attributes-natural-language", goipp.TagLanguage, goipp.String("en-US")))
	req.Operation.Add(goipp.MakeAttribute("printer-uri", goipp.TagURI, goipp.String(endpoint)))
	req.Operation.Add(goipp.MakeAttribute("document-format", goipp.TagMimeType, goipp.String("application/vnd.zebra-zpl")))
	req.Job.Add(makeAttrCollection("media-col",
		goipp.MakeAttribute("media-left-margin", goipp.TagInteger, goipp.Integer(0)),
		goipp.MakeAttribute("media-right-margin", goipp.TagInteger, goipp.Integer(0)),
		goipp.MakeAttribute("media-top-margin", goipp.TagInteger, goipp.Integer(0)),
		goipp.MakeAttribute("media-bottom-margin", goipp.TagInteger, goipp.Integer(0)),
	))

	var buf bytes.Buffer
	if err := req.Encode(&buf); err != nil {
		return fmt.Errorf("encode ipp request: %w", err)
	}
	buf.Write(zpl)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return fmt.Errorf("create ipp http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", goipp.ContentType)

	resp, err := d.client().Do(httpReq)
	if err != nil {
		return fmt.Errorf("send ipp print job: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("printer returned status %s", resp.Status)
	}
	return nil
}

func (d *IPPDriver) MediaReady(ctx context.Context, endpoint string) (string, error) {
	m := goipp.NewRequest(goipp.DefaultVersion, goipp.OpGetPrinterAttributes, 1)
	m.Operation.Add(goipp.MakeAttribute("attributes-charset", goipp.TagCharset, goipp.String("utf-8")))
	m.Operation.Add(goipp.MakeAttribute("attributes-natural-language", goipp.TagLanguage, goipp.String("en-US")))
	m.Operation.Add(goipp.MakeAttribute("printer-uri", goipp.TagURI, goipp.String(endpoint)))
	m.Operation.Add(goipp.MakeAttribute("requested-attributes", goipp.TagKeyword, goipp.String("media-ready")))

	encoded, err := m.EncodeBytes()
	if err != nil {
		return "", err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", goipp.ContentType)

	resp, err := d.client().Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var respMsg goipp.Message
	if err := respMsg.Decode(resp.Body); err != nil {
		return "", err
	}
	for _, group := range respMsg.Groups {
		for _, attr := range group.Attrs {
			if attr.Name == "media-ready" && len(attr.Values) > 0 {
				return fmt.Sprintf("%v", attr.Values[0].V), nil
			}
		}
	}
	return "", nil
}

func makeAttrCollection(name string, member1 goipp.Attribute, members ...goipp.Attribute) goipp.Attribute {
	col := make(goipp.Collection, len(members)+1)
	col[0] = member1
	copy(col[1:], members)
	return goipp.MakeAttribute(name, goipp.TagBeginCollection, col)
}

type RawTCPDriver struct {
	Timeout     time.Duration
	DialContext func(ctx context.Context, network, addr string) (net.Conn, error)
}

// NormalizeRawTCPEndpoint normalizes a raw TCP ZPL printer endpoint into canonical host:port form.
// It accepts host:port, bare host/IP (defaulting port to 9100), IPv6 literals, and URL-formatted
// strings (e.g., http://192.168.1.102:9100, tcp://192.168.1.102, socket://192.168.1.102:9100/).
func NormalizeRawTCPEndpoint(endpoint string) (string, error) {
	raw := strings.TrimSpace(endpoint)
	if raw == "" {
		return "", fmt.Errorf("endpoint is required")
	}

	var host, port string
	if strings.Contains(raw, "://") {
		u, err := url.Parse(raw)
		if err != nil {
			return "", fmt.Errorf("invalid endpoint URL: %w", err)
		}
		host = u.Hostname()
		port = u.Port()
	} else {
		hostPort, _, _ := strings.Cut(raw, "/")
		hostPort = strings.TrimSpace(hostPort)
		if h, p, err := net.SplitHostPort(hostPort); err == nil {
			host = h
			port = p
		} else {
			unbracketed := hostPort
			if strings.HasPrefix(hostPort, "[") && strings.HasSuffix(hostPort, "]") {
				unbracketed = hostPort[1 : len(hostPort)-1]
			}
			if ip := net.ParseIP(unbracketed); ip != nil {
				host = unbracketed
			} else if strings.Contains(hostPort, ":") || strings.ContainsAny(hostPort, "[]") {
				return "", fmt.Errorf("invalid raw tcp endpoint %q", endpoint)
			} else {
				host = hostPort
			}
		}
	}

	host = strings.TrimSpace(host)
	if host == "" || strings.ContainsAny(host, " \t\r\n/") {
		return "", fmt.Errorf("invalid raw tcp endpoint host in %q", endpoint)
	}
	if port == "" {
		port = "9100"
	}
	pNum, err := strconv.Atoi(port)
	if err != nil || pNum < 1 || pNum > 65535 {
		return "", fmt.Errorf("invalid raw tcp endpoint port %q", port)
	}
	return net.JoinHostPort(host, strconv.Itoa(pNum)), nil
}

func (d *RawTCPDriver) Print(ctx context.Context, endpoint string, zpl []byte) error {
	addr, err := NormalizeRawTCPEndpoint(endpoint)
	if err != nil {
		return fmt.Errorf("invalid raw tcp printer endpoint %q: %w", endpoint, err)
	}
	timeout := d.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	dialFn := d.DialContext
	if dialFn == nil {
		dialer := &net.Dialer{Timeout: timeout}
		dialFn = dialer.DialContext
	}
	conn, err := dialFn(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("connect raw tcp printer %s: %w", addr, err)
	}
	defer conn.Close()

	_ = conn.SetWriteDeadline(time.Now().Add(timeout))
	if _, err := conn.Write(zpl); err != nil {
		return fmt.Errorf("write zpl to %s: %w", addr, err)
	}
	return nil
}

func (d *RawTCPDriver) MediaReady(_ context.Context, _ string) (string, error) {
	return "", nil
}

type Service struct {
	drivers map[string]Driver
}

func NewService() *Service {
	return &Service{
		drivers: map[string]Driver{
			DriverIPPZPL:    &IPPDriver{},
			DriverRawTCPZPL: &RawTCPDriver{},
		},
	}
}

func (s *Service) RegisterDriver(name string, d Driver) {
	s.drivers[name] = d
}

// DefaultTemplate returns the embedded default ZPL template for entityType.
func DefaultTemplate(entityType string) (string, error) {
	switch entityType {
	case EntityItem, EntityProduct, EntityLocation:
		b, err := defaultTemplatesFS.ReadFile("templates/" + entityType + ".zpl")
		if err != nil {
			return "", err
		}
		return string(b), nil
	default:
		return "", fmt.Errorf("unknown label entity type: %s", entityType)
	}
}

// Render executes the ZPL template (using overrideTemplate if non-empty, otherwise embedded default).
func (s *Service) Render(entityType, overrideTemplate string, payload LabelPayload, mediaReady string) ([]byte, error) {
	if payload.PurchasedOnDate != "" && payload.PurchasedDate.IsZero() {
		if t, err := time.Parse("2006-01-02", payload.PurchasedOnDate); err == nil {
			payload.PurchasedDate = t
		}
	}
	if payload.DueOnDate != "" && payload.DueDate.IsZero() {
		if t, err := time.Parse("2006-01-02", payload.DueOnDate); err == nil {
			payload.DueDate = t
		}
	}

	tmplText := strings.TrimSpace(overrideTemplate)
	if tmplText == "" {
		def, err := DefaultTemplate(entityType)
		if err != nil {
			return nil, err
		}
		tmplText = def
	}

	tmpl, err := template.New(entityType).Funcs(TemplateFuncs).Parse(tmplText)
	if err != nil {
		return nil, fmt.Errorf("parse zpl template: %w", err)
	}

	var buf bytes.Buffer
	data := struct {
		Payload    LabelPayload
		MediaReady string
	}{
		Payload:    payload,
		MediaReady: mediaReady,
	}
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, fmt.Errorf("render zpl template: %w", err)
	}
	return buf.Bytes(), nil
}

// Print queries media-ready (non-fatal on error), renders the template, and dispatches to the driver.
func (s *Service) Print(ctx context.Context, cfg PrinterConfig, entityType, overrideTemplate string, payload LabelPayload) error {
	drv, ok := s.drivers[cfg.Driver]
	if !ok {
		return fmt.Errorf("unsupported printer driver: %s", cfg.Driver)
	}
	mediaReady, _ := drv.MediaReady(ctx, cfg.Endpoint)
	zpl, err := s.Render(entityType, overrideTemplate, payload, mediaReady)
	if err != nil {
		return err
	}
	return drv.Print(ctx, cfg.Endpoint, zpl)
}
