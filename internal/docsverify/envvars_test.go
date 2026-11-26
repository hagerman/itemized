package docsverify_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	return filepath.Clean(filepath.Join(wd, "../.."))
}

func TestConfigurationReferenceMatchesEnvVars(t *testing.T) {
	root := repoRoot(t)

	// 1. Collect env vars from Go code under cmd/ and internal/
	codeVars := map[string]string{} // envVar -> first file seen
	fset := token.NewFileSet()

	for _, dir := range []string{"cmd", "internal"} {
		err := filepath.WalkDir(filepath.Join(root, dir), func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() || !strings.HasSuffix(p, ".go") || strings.HasSuffix(p, "_test.go") {
				return nil
			}
			file, err := parser.ParseFile(fset, p, nil, 0)
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(root, p)
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				// os.Getenv("VAR") or os.LookupEnv("VAR")
				if ident, ok := sel.X.(*ast.Ident); ok && ident.Name == "os" && (sel.Sel.Name == "Getenv" || sel.Sel.Name == "LookupEnv") {
					if len(call.Args) >= 1 {
						if lit, ok := call.Args[0].(*ast.BasicLit); ok && lit.Kind == token.STRING {
							if name, err := strconv.Unquote(lit.Value); err == nil && name != "" {
								if _, exists := codeVars[name]; !exists {
									codeVars[name] = rel
								}
							}
						}
					}
				}
				// s.getSetting(ctx, key, "ENV_VAR", defaultVal)
				if sel.Sel.Name == "getSetting" && len(call.Args) >= 3 {
					if lit, ok := call.Args[2].(*ast.BasicLit); ok && lit.Kind == token.STRING {
						if name, err := strconv.Unquote(lit.Value); err == nil && name != "" {
							if _, exists := codeVars[name]; !exists {
								codeVars[name] = rel
							}
						}
					}
				}
				return true
			})
			return nil
		})
		if err != nil {
			t.Fatalf("walk %s: %v", dir, err)
		}
	}

	// 2. Collect env vars from docker-entrypoint.sh (${VAR:-...})
	entrypointPath := filepath.Join(root, "docker-entrypoint.sh")
	if raw, err := os.ReadFile(entrypointPath); err == nil {
		re := regexp.MustCompile(`\$\{([A-Z][A-Z0-9_]*):-`)
		for _, m := range re.FindAllStringSubmatch(string(raw), -1) {
			name := m[1]
			if _, exists := codeVars[name]; !exists {
				codeVars[name] = "docker-entrypoint.sh"
			}
		}
	}

	// 3. Parse docs/self-hosting/configuration.md table
	cfgPath := filepath.Join(root, "docs/self-hosting/configuration.md")
	cfgBytes, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read configuration.md: %v", err)
	}
	cfgText := string(cfgBytes)
	if !strings.Contains(strings.ToLower(cfgText), "no environment variable is mandatory") {
		t.Errorf("docs/self-hosting/configuration.md must state that no environment variable is mandatory")
	}

	docVars := map[string]bool{}
	rowRe := regexp.MustCompile("(?m)^\\|\\s*`([A-Z][A-Z0-9_]*)`\\s*\\|")
	for _, m := range rowRe.FindAllStringSubmatch(cfgText, -1) {
		docVars[m[1]] = true
	}

	var missing []string
	for v, file := range codeVars {
		if !docVars[v] {
			missing = append(missing, v+" (read in "+file+")")
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("environment variables read in code but missing from docs/self-hosting/configuration.md:\n  %s", strings.Join(missing, "\n  "))
	}

	var stale []string
	for v := range docVars {
		if _, ok := codeVars[v]; !ok {
			stale = append(stale, v)
		}
	}
	sort.Strings(stale)
	if len(stale) > 0 {
		t.Errorf("environment variables listed in docs/self-hosting/configuration.md but never read in code:\n  %s", strings.Join(stale, "\n  "))
	}
}
