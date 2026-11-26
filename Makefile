.PHONY: test build docs-build docs-check docs-screenshots docs-a11y check

test:
	go vet ./...
	go test ./...
	cd web && npm test

build:
	cd web && npm run build
	go build ./cmd/itemized

docs-build:
	cd web && npm run docs:build

docs-check:
	cd web && npm run docs:check

docs-screenshots:
	cd web && npm run docs:screenshots

docs-a11y:
	cd web && npm run docs:a11y

check: docs-check test
