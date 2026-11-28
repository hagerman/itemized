package notify

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"itemized/internal/domain"
)

const (
	// defaultDueSoonDays matches itemized's standard due-soon horizon.
	defaultDueSoonDays = 7
	// catchUpGraceWindow bounds how late after digest_time a restart can still deliver today's digest.
	catchUpGraceWindow = 2 * time.Hour
	// maxPreviewItems limits item names shown in a mobile notification body.
	maxPreviewItems = 3
)

// DigestProduct is a lightweight product record used for digest formatting.
type DigestProduct struct {
	Name          string
	NextDueOnDate *string
}

// DigestSnapshot captures the current household inventory state for daily digests.
type DigestSnapshot struct {
	Overdue      []DigestProduct
	DueSoon      []DigestProduct
	ShoppingList []DigestProduct
}

// LoadDigestSnapshot queries products and unconsumed items from SQLite using the
// same due-soon, overdue, and shopping-list rules as the inventory summary endpoint.
func LoadDigestSnapshot(ctx context.Context, conn *sql.DB, today time.Time) (DigestSnapshot, error) {
	type prodRow struct {
		id         int64
		name       string
		minVal     *int
		manualShop bool
		inStock    int
		nextDue    *string
	}

	rows, err := conn.QueryContext(ctx, `
		SELECT id, name, minimum_value, manually_added_to_shopping_list
		FROM products
		ORDER BY name COLLATE NOCASE ASC
	`)
	if err != nil {
		return DigestSnapshot{}, fmt.Errorf("load digest products: %w", err)
	}
	defer rows.Close()

	byID := map[int64]*prodRow{}
	order := make([]*prodRow, 0)
	for rows.Next() {
		var p prodRow
		var minVal sql.NullInt64
		var manual int
		if err := rows.Scan(&p.id, &p.name, &minVal, &manual); err != nil {
			return DigestSnapshot{}, fmt.Errorf("scan digest product: %w", err)
		}
		if minVal.Valid {
			v := int(minVal.Int64)
			p.minVal = &v
		}
		p.manualShop = manual != 0
		byID[p.id] = &p
		order = append(order, &p)
	}
	if err := rows.Err(); err != nil {
		return DigestSnapshot{}, err
	}

	itemRows, err := conn.QueryContext(ctx, `
		SELECT product_id, due_on_date
		FROM items
		WHERE consumed_on_date IS NULL
	`)
	if err != nil {
		return DigestSnapshot{}, fmt.Errorf("load digest items: %w", err)
	}
	defer itemRows.Close()

	for itemRows.Next() {
		var pid int64
		var due sql.NullString
		if err := itemRows.Scan(&pid, &due); err != nil {
			return DigestSnapshot{}, fmt.Errorf("scan digest item: %w", err)
		}
		p, ok := byID[pid]
		if !ok {
			continue
		}
		p.inStock++
		if due.Valid && due.String != "" {
			if p.nextDue == nil || due.String < *p.nextDue {
				d := due.String
				p.nextDue = &d
			}
		}
	}
	if err := itemRows.Err(); err != nil {
		return DigestSnapshot{}, err
	}

	var snap DigestSnapshot
	for _, p := range order {
		if domain.IsOnShoppingList(p.inStock, p.minVal, p.manualShop) {
			snap.ShoppingList = append(snap.ShoppingList, DigestProduct{
				Name:          p.name,
				NextDueOnDate: p.nextDue,
			})
		}
		if p.nextDue != nil {
			if t, err := time.Parse(domain.DateLayout, *p.nextDue); err == nil {
				if domain.IsOverdue(&t, today) {
					snap.Overdue = append(snap.Overdue, DigestProduct{
						Name:          p.name,
						NextDueOnDate: p.nextDue,
					})
				} else if domain.IsDueSoon(&t, today, defaultDueSoonDays) {
					snap.DueSoon = append(snap.DueSoon, DigestProduct{
						Name:          p.name,
						NextDueOnDate: p.nextDue,
					})
				}
			}
		}
	}

	sortByDueDate(snap.Overdue)
	sortByDueDate(snap.DueSoon)
	return snap, nil
}

func sortByDueDate(list []DigestProduct) {
	sort.SliceStable(list, func(i, j int) bool {
		a, b := list[i].NextDueOnDate, list[j].NextDueOnDate
		if a != nil && b != nil && *a != *b {
			return *a < *b
		}
		return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name)
	})
}

func formatNamePreview(items []DigestProduct) string {
	if len(items) == 0 {
		return ""
	}
	n := len(items)
	if n > maxPreviewItems {
		n = maxPreviewItems
	}
	names := make([]string, 0, n)
	for i := 0; i < n; i++ {
		names = append(names, items[i].Name)
	}
	preview := strings.Join(names, ", ")
	if len(items) > maxPreviewItems {
		preview += fmt.Sprintf(" (+%d more)", len(items)-maxPreviewItems)
	}
	return preview
}

// FormatExpirationMessage builds the expiration/overdue digest notification, or
// returns (Message{}, false) when both overdue and due-soon lists are empty.
func FormatExpirationMessage(snap DigestSnapshot) (Message, bool) {
	overdueCount := len(snap.Overdue)
	dueSoonCount := len(snap.DueSoon)
	if overdueCount == 0 && dueSoonCount == 0 {
		return Message{}, false
	}

	var parts []string
	if overdueCount > 0 {
		parts = append(parts, fmt.Sprintf("%d overdue", overdueCount))
	}
	if dueSoonCount > 0 {
		parts = append(parts, fmt.Sprintf("%d due soon", dueSoonCount))
	}

	combined := make([]DigestProduct, 0, overdueCount+dueSoonCount)
	combined = append(combined, snap.Overdue...)
	combined = append(combined, snap.DueSoon...)

	title := "Itemized: Expiring Soon"
	url := "/?status=due_soon"
	if overdueCount > 0 {
		title = "Itemized: Overdue Items"
		url = "/?status=overdue"
	}

	return Message{
		Topic: TopicExpiration,
		Title: title,
		Body:  fmt.Sprintf("%s: %s", strings.Join(parts, ", "), formatNamePreview(combined)),
		URL:   url,
		Tag:   "itemized-expiration",
	}, true
}

// FormatShoppingListMessage builds the shopping list digest notification, or
// returns (Message{}, false) when the shopping list is empty.
func FormatShoppingListMessage(snap DigestSnapshot) (Message, bool) {
	count := len(snap.ShoppingList)
	if count == 0 {
		return Message{}, false
	}
	noun := "items"
	if count == 1 {
		noun = "item"
	}
	return Message{
		Topic: TopicShoppingList,
		Title: "Itemized: Shopping List",
		Body:  fmt.Sprintf("%d %s needed: %s", count, noun, formatNamePreview(snap.ShoppingList)),
		URL:   "/?status=shopping_list",
		Tag:   "itemized-shopping-list",
	}, true
}

// Scheduler periodically evaluates per-user daily digests and dispatches due notifications.
type Scheduler struct {
	Store      *Store
	Dispatcher *Dispatcher
	Now        func() time.Time
	Interval   time.Duration
}

// NewScheduler constructs a Scheduler with a 1-minute tick interval using time.Now (container TZ).
func NewScheduler(store *Store, dispatcher *Dispatcher) *Scheduler {
	return &Scheduler{
		Store:      store,
		Dispatcher: dispatcher,
		Now:        time.Now,
		Interval:   time.Minute,
	}
}

// Start runs the scheduler loop in a background goroutine until ctx is canceled.
func (s *Scheduler) Start(ctx context.Context) {
	interval := s.Interval
	if interval <= 0 {
		interval = time.Minute
	}
	go func() {
		// Run an initial check on startup so restarts within the grace window catch up.
		s.RunOnce(ctx)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.RunOnce(ctx)
			}
		}
	}()
}

// RunOnce evaluates all active users at the current local time and dispatches any due digests.
func (s *Scheduler) RunOnce(ctx context.Context) {
	now := s.Now()
	todayStr := now.Format(domain.DateLayout)
	todayDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	prefs, err := s.Store.ListActivePreferences(ctx)
	if err != nil {
		log.Printf("notify scheduler: list active preferences: %v", err)
		return
	}
	if len(prefs) == 0 {
		return
	}

	var snapLoaded bool
	var snap DigestSnapshot

	for _, pref := range prefs {
		if !isDueWindow(now, pref.DigestTime) {
			continue
		}

		needExp := pref.ExpirationEnabled && (pref.ExpirationLastSentDate == nil || *pref.ExpirationLastSentDate != todayStr)
		needShop := pref.ShoppingListEnabled && (pref.ShoppingListLastSentDate == nil || *pref.ShoppingListLastSentDate != todayStr)
		if !needExp && !needShop {
			continue
		}

		if !snapLoaded {
			snap, err = LoadDigestSnapshot(ctx, s.Store.DB(), todayDate)
			if err != nil {
				log.Printf("notify scheduler: load digest snapshot: %v", err)
				return
			}
			snapLoaded = true
		}

		if needExp {
			if msg, ok := FormatExpirationMessage(snap); ok {
				if _, err := s.Dispatcher.SendToUser(ctx, pref.UserID, msg); err != nil {
					log.Printf("notify scheduler: dispatch expiration for user %d: %v", pref.UserID, err)
				}
			}
			if err := s.Store.MarkDigestSent(ctx, pref.UserID, TopicExpiration, todayStr); err != nil {
				log.Printf("notify scheduler: mark expiration sent for user %d: %v", pref.UserID, err)
			}
		}

		if needShop {
			if msg, ok := FormatShoppingListMessage(snap); ok {
				if _, err := s.Dispatcher.SendToUser(ctx, pref.UserID, msg); err != nil {
					log.Printf("notify scheduler: dispatch shopping_list for user %d: %v", pref.UserID, err)
				}
			}
			if err := s.Store.MarkDigestSent(ctx, pref.UserID, TopicShoppingList, todayStr); err != nil {
				log.Printf("notify scheduler: mark shopping_list sent for user %d: %v", pref.UserID, err)
			}
		}
	}
}

// isDueWindow returns true when now is at or after digestTime today and within catchUpGraceWindow.
func isDueWindow(now time.Time, digestTime string) bool {
	if err := ValidateDigestTime(digestTime); err != nil {
		return false
	}
	var hour, minute int
	if _, err := fmt.Sscanf(digestTime, "%d:%d", &hour, &minute); err != nil {
		return false
	}
	scheduled := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, now.Location())
	if now.Before(scheduled) {
		return false
	}
	return now.Sub(scheduled) <= catchUpGraceWindow
}
