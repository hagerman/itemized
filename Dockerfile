# Stage 1: Build React SPA
FROM node:22-alpine AS web-builder
WORKDIR /src/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci || npm install
COPY web/ ./
RUN npm run build

# Stage 2: Build pure-Go server & migration CLI (CGO_ENABLED=0 for easy multi-arch)
FROM golang:1.26-alpine AS go-builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY web/embed.go ./web/embed.go
COPY --from=web-builder /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/itemized ./cmd/itemized \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/itemized-migrate ./cmd/itemized-migrate

# Stage 3: Minimal runtime image
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata \
 && mkdir -p /data
COPY --from=go-builder /out/itemized /usr/local/bin/itemized
COPY --from=go-builder /out/itemized-migrate /usr/local/bin/itemized-migrate

ENV PORT=8080 \
    DB_PATH=/data/itemized.db

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/up || exit 1

ENTRYPOINT ["/usr/local/bin/itemized"]
