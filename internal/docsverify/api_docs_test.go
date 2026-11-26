package docsverify_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"itemized/internal/api"
	"itemized/internal/db"
)

func TestAPIDocsErrorCatalog(t *testing.T) {
	root := repoRoot(t)
	raw, err := os.ReadFile(filepath.Join(root, "docs/api.md"))
	if err != nil {
		t.Fatalf("read docs/api.md: %v", err)
	}

	docCodes := map[int]string{}
	rowRe := regexp.MustCompile("(?m)^\\|\\s*`([0-9]{3})`\\s*\\|\\s*`([^`]+)`\\s*\\|")
	for _, m := range rowRe.FindAllStringSubmatch(string(raw), -1) {
		status, _ := strconv.Atoi(m[1])
		docCodes[status] = m[2]
	}

	catalogCodes := map[int]string{}
	for _, spec := range api.ErrorCatalog {
		catalogCodes[spec.Status] = spec.Code
		gotCode, ok := docCodes[spec.Status]
		if !ok {
			t.Errorf("docs/api.md error table missing HTTP status %d (%s)", spec.Status, spec.Code)
			continue
		}
		if gotCode != spec.Code {
			t.Errorf("docs/api.md status %d has code %q, want %q", spec.Status, gotCode, spec.Code)
		}
	}

	for status, code := range docCodes {
		if _, ok := catalogCodes[status]; !ok {
			t.Errorf("docs/api.md lists HTTP status %d (%s) not present in api.ErrorCatalog", status, code)
		}
	}
}

type apiExampleBlock struct {
	startLine       int
	unauthenticated bool
	method          string
	path            string
	headers         map[string]string
	body            string
	expectStatus    int
	expectKeys      []string
	captures        map[string]string // varName -> jsonKey
}

func parseAPIExamples(t *testing.T, content string) []apiExampleBlock {
	t.Helper()
	lines := strings.Split(content, "\n")
	var blocks []apiExampleBlock

	for i := 0; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(trimmed, "```http run") {
			continue
		}
		block := apiExampleBlock{
			startLine:       i + 1,
			unauthenticated: strings.Contains(trimmed, "unauthenticated"),
			headers:         map[string]string{},
			captures:        map[string]string{},
		}
		i++
		var bodyLines []string
		inBody := false
		for i < len(lines) && strings.TrimSpace(lines[i]) != "```" {
			line := lines[i]
			tline := strings.TrimSpace(line)
			switch {
			case strings.HasPrefix(tline, "# expect-status:"):
				v := strings.TrimSpace(strings.TrimPrefix(tline, "# expect-status:"))
				st, err := strconv.Atoi(v)
				if err != nil {
					t.Fatalf("docs/api.md:%d invalid expect-status %q", i+1, v)
				}
				block.expectStatus = st
			case strings.HasPrefix(tline, "# expect-keys:"):
				rawKeys := strings.TrimSpace(strings.TrimPrefix(tline, "# expect-keys:"))
				for _, k := range strings.Split(rawKeys, ",") {
					if k = strings.TrimSpace(k); k != "" {
						block.expectKeys = append(block.expectKeys, k)
					}
				}
			case strings.HasPrefix(tline, "# capture:"):
				rawCap := strings.TrimSpace(strings.TrimPrefix(tline, "# capture:"))
				parts := strings.SplitN(rawCap, "=", 2)
				if len(parts) == 2 {
					block.captures[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
				}
			case block.method == "" && tline != "":
				parts := strings.Fields(tline)
				if len(parts) < 2 {
					t.Fatalf("docs/api.md:%d invalid request line %q", i+1, tline)
				}
				block.method = parts[0]
				block.path = parts[1]
			case !inBody && tline == "":
				inBody = true
			case !inBody && strings.Contains(tline, ":"):
				kv := strings.SplitN(tline, ":", 2)
				block.headers[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
			case inBody:
				bodyLines = append(bodyLines, line)
			}
			i++
		}
		block.body = strings.TrimSpace(strings.Join(bodyLines, "\n"))
		blocks = append(blocks, block)
	}
	return blocks
}

func TestAPIDocsExamplesExecute(t *testing.T) {
	root := repoRoot(t)
	raw, err := os.ReadFile(filepath.Join(root, "docs/api.md"))
	if err != nil {
		t.Fatalf("read docs/api.md: %v", err)
	}

	blocks := parseAPIExamples(t, string(raw))
	if len(blocks) < 10 {
		t.Fatalf("expected at least 10 executable API examples in docs/api.md, got %d", len(blocks))
	}

	conn, err := db.Open(filepath.Join(t.TempDir(), "apidocs.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	srv := api.NewServer(conn, nil)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	// Setup initial admin user and capture session cookie
	setupBody := `{"email":"admin@example.com","password":"password123"}`
	resp, err := http.Post(ts.URL+"/api/auth/setup", "application/json", strings.NewReader(setupBody))
	if err != nil {
		t.Fatalf("setup request: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("setup status = %d, want 201", resp.StatusCode)
	}
	cookies := resp.Cookies()
	if len(cookies) == 0 {
		t.Fatalf("expected session cookie from /api/auth/setup")
	}

	vars := map[string]string{}
	substitute := func(s string) string {
		for k, v := range vars {
			s = strings.ReplaceAll(s, "{{"+k+"}}", v)
		}
		return s
	}

	seen401 := false
	seen400 := false

	for idx, b := range blocks {
		reqPath := substitute(b.path)
		reqBody := substitute(b.body)

		var bodyReader io.Reader
		if reqBody != "" {
			bodyReader = bytes.NewBufferString(reqBody)
		}
		req, err := http.NewRequest(b.method, ts.URL+reqPath, bodyReader)
		if err != nil {
			t.Fatalf("docs/api.md:%d build request: %v", b.startLine, err)
		}
		for k, v := range b.headers {
			req.Header.Set(k, v)
		}
		if !b.unauthenticated {
			for _, c := range cookies {
				req.AddCookie(c)
			}
		}

		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("docs/api.md:%d execute %s %s: %v", b.startLine, b.method, reqPath, err)
		}
		respBytes, _ := io.ReadAll(res.Body)
		_ = res.Body.Close()

		if res.StatusCode != b.expectStatus {
			t.Fatalf("docs/api.md:%d (%s %s) status = %d, want %d; body=%s", b.startLine, b.method, reqPath, res.StatusCode, b.expectStatus, string(respBytes))
		}
		if b.unauthenticated && b.expectStatus == http.StatusUnauthorized {
			seen401 = true
		}
		if b.expectStatus == http.StatusBadRequest {
			seen400 = true
		}

		if len(b.expectKeys) > 0 || len(b.captures) > 0 {
			var payload map[string]any
			if err := json.Unmarshal(respBytes, &payload); err != nil {
				t.Fatalf("docs/api.md:%d (example #%d) invalid JSON response: %v; body=%s", b.startLine, idx+1, err, string(respBytes))
			}
			for _, key := range b.expectKeys {
				if _, ok := payload[key]; !ok {
					t.Errorf("docs/api.md:%d (%s %s) missing documented top-level response key %q; got keys in %s", b.startLine, b.method, reqPath, key, string(respBytes))
				}
			}
			for varName, jsonPath := range b.captures {
				var cur any = payload
				for _, seg := range strings.Split(jsonPath, ".") {
					m, ok := cur.(map[string]any)
					if !ok {
						t.Fatalf("docs/api.md:%d cannot capture %q from path %q", b.startLine, varName, jsonPath)
					}
					cur, ok = m[seg]
					if !ok {
						t.Fatalf("docs/api.md:%d cannot capture %q from missing key %q in path %q", b.startLine, varName, seg, jsonPath)
					}
				}
				switch v := cur.(type) {
				case float64:
					vars[varName] = strconv.FormatInt(int64(v), 10)
				default:
					vars[varName] = fmt.Sprint(v)
				}
			}
		}
	}

	if !seen401 {
		t.Errorf("docs/api.md must include an executed unauthenticated 401 example")
	}
	if !seen400 {
		t.Errorf("docs/api.md must include an executed invalid-input 400 example")
	}
}
