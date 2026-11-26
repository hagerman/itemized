package docsverify_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

func TestInternalPackagesDocumented(t *testing.T) {
	root := repoRoot(t)
	internalDir := filepath.Join(root, "internal")

	topLevel := map[string]bool{}
	allPackages := map[string]bool{}

	err := filepath.WalkDir(internalDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			return nil
		}
		if p == internalDir {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)

		// Include directories that contain .go files or embedded assets (.sql, .zpl)
		entries, err := os.ReadDir(p)
		if err != nil {
			return err
		}
		hasFiles := false
		for _, e := range entries {
			if !e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				hasFiles = true
				break
			}
		}
		if !hasFiles {
			return nil
		}

		allPackages[rel] = true
		parts := strings.Split(rel, "/")
		if len(parts) == 2 {
			topLevel[rel] = true
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk internal/: %v", err)
	}

	// Check docs/contributing/packages.md
	pkgDocBytes, err := os.ReadFile(filepath.Join(root, "docs/contributing/packages.md"))
	if err != nil {
		t.Fatalf("read docs/contributing/packages.md: %v", err)
	}
	pkgDoc := string(pkgDocBytes)

	for pkg := range allPackages {
		if !strings.Contains(pkgDoc, "`"+pkg+"`") {
			t.Errorf("docs/contributing/packages.md is missing package `%s`", pkg)
		}
	}

	// Check no stale internal/* packages listed in docs/contributing/packages.md
	listedRe := regexp.MustCompile("`(internal/[a-zA-Z0-9_/-]+)`")
	for _, m := range listedRe.FindAllStringSubmatch(pkgDoc, -1) {
		listed := m[1]
		if !allPackages[listed] {
			t.Errorf("docs/contributing/packages.md lists removed or unknown package `%s`", listed)
		}
	}

	// Check docs/architecture.md has a table row for every top-level internal/* package
	archBytes, err := os.ReadFile(filepath.Join(root, "docs/architecture.md"))
	if err != nil {
		t.Fatalf("read docs/architecture.md: %v", err)
	}
	archDoc := string(archBytes)
	for pkg := range topLevel {
		rowMarker := "| `" + pkg + "` |"
		if !strings.Contains(archDoc, rowMarker) {
			t.Errorf("docs/architecture.md is missing table row for top-level package `%s`", pkg)
		}
	}
}

func TestContributorMakeTargetsExist(t *testing.T) {
	root := repoRoot(t)
	makefileBytes, err := os.ReadFile(filepath.Join(root, "Makefile"))
	if err != nil {
		t.Fatalf("read Makefile: %v", err)
	}

	targets := map[string]bool{}
	targetRe := regexp.MustCompile(`(?m)^([a-zA-Z0-9_-]+):`)
	for _, m := range targetRe.FindAllStringSubmatch(string(makefileBytes), -1) {
		targets[m[1]] = true
	}

	contribDir := filepath.Join(root, "docs/contributing")
	entries, err := os.ReadDir(contribDir)
	if err != nil {
		t.Fatalf("read docs/contributing: %v", err)
	}

	makeRefRe := regexp.MustCompile("`make ([a-zA-Z0-9_-]+)`")
	var missing []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(contribDir, e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		for _, m := range makeRefRe.FindAllStringSubmatch(string(raw), -1) {
			target := m[1]
			if !targets[target] {
				missing = append(missing, "docs/contributing/"+e.Name()+": `make "+target+"` not found in Makefile")
			}
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("broken Makefile target references:\n  %s", strings.Join(missing, "\n  "))
	}
}
