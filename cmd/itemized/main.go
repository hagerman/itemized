package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"itemized/internal/api"
	"itemized/internal/db"
	"itemized/internal/demo"
	"itemized/internal/notify"
	"itemized/web"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/data/itemized.db"
	}

	conn, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("failed to open database %s: %v", dbPath, err)
	}
	defer conn.Close()

	staticFS, err := web.DistFS()
	if err != nil {
		log.Fatalf("failed to load embedded web assets: %v", err)
	}

	srv := api.NewServer(conn, staticFS)

	bgCtx, bgCancel := context.WithCancel(context.Background())
	defer bgCancel()

	demoMode := strings.EqualFold(strings.TrimSpace(os.Getenv("DEMO_MODE")), "true")
	if demoMode {
		interval := demo.DefaultResetInterval
		if raw := strings.TrimSpace(os.Getenv("DEMO_RESET_INTERVAL")); raw != "" {
			if d, err := time.ParseDuration(raw); err == nil && d > 0 {
				interval = d
			} else {
				log.Printf("invalid DEMO_RESET_INTERVAL %q, falling back to %s", raw, demo.DefaultResetInterval)
			}
		}
		demoMgr, err := demo.NewManager(conn, interval)
		if err != nil {
			log.Fatalf("failed to initialize demo mode: %v", err)
		}
		srv.EnableDemoMode(demoMgr)
		demoMgr.Start(bgCtx)
		log.Printf("Demo mode enabled (reset interval: %s, next reset: %s)", interval, demoMgr.NextResetAt().Format(time.RFC3339))
	} else {
		sched := notify.NewScheduler(srv.NotifyStore, srv.NotifyDispatcher)
		sched.Start(bgCtx)
		log.Printf("Notification digest scheduler started (timezone: %s)", notify.LocalTimezoneName())
	}

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("Itemized listening on :%s (db: %s)", port, dbPath)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	bgCancel()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}
