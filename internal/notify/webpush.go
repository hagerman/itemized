package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// WebPushChannel delivers notifications via the Web Push protocol (RFC 8291/8292).
type WebPushChannel struct {
	Store      *Store
	HTTPClient webpush.HTTPClient
}

// NewWebPushChannel creates a WebPushChannel backed by store.
func NewWebPushChannel(store *Store) *WebPushChannel {
	return &WebPushChannel{
		Store: store,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// Type returns ChannelWebPush.
func (c *WebPushChannel) Type() string {
	return ChannelWebPush
}

// Send encrypts msg and POSTs it to the target's Web Push endpoint using the server's VAPID keys.
func (c *WebPushChannel) Send(ctx context.Context, target Target, msg Message) error {
	var cfg WebPushConfig
	if err := json.Unmarshal([]byte(target.ConfigJSON), &cfg); err != nil {
		return fmt.Errorf("parse web push target config: %w", err)
	}
	if cfg.Endpoint == "" || cfg.P256DH == "" || cfg.Auth == "" {
		return fmt.Errorf("%w: incomplete subscription config", ErrTargetGone)
	}

	keys, err := c.Store.EnsureVAPIDKeys(ctx)
	if err != nil {
		return fmt.Errorf("ensure VAPID keys: %w", err)
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal push payload: %w", err)
	}

	subscriber := "noreply@itemized.local"
	if base := c.Store.GetBaseURL(ctx); base != "" {
		if u, parseErr := url.Parse(base); parseErr == nil && u.Hostname() != "" && u.Hostname() != "localhost" {
			subscriber = "noreply@" + u.Hostname()
		}
	}

	sub := &webpush.Subscription{
		Endpoint: cfg.Endpoint,
		Keys: webpush.Keys{
			P256dh: cfg.P256DH,
			Auth:   cfg.Auth,
		},
	}

	resp, err := webpush.SendNotificationWithContext(ctx, payload, sub, &webpush.Options{
		HTTPClient:      c.HTTPClient,
		Subscriber:      subscriber,
		VAPIDPublicKey:  keys.PublicKey,
		VAPIDPrivateKey: keys.PrivateKey,
		TTL:             86400,
	})
	if err != nil {
		return fmt.Errorf("send web push: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return fmt.Errorf("%w (status %d)", ErrTargetGone, resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return fmt.Errorf("push service returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

// Dispatcher routes Messages to registered Channels across a user's targets.
type Dispatcher struct {
	Store    *Store
	channels map[string]Channel
}

// NewDispatcher creates a Dispatcher with the given channels registered.
func NewDispatcher(store *Store, channels ...Channel) *Dispatcher {
	m := make(map[string]Channel, len(channels))
	for _, ch := range channels {
		if ch != nil {
			m[ch.Type()] = ch
		}
	}
	return &Dispatcher{
		Store:    store,
		channels: m,
	}
}

// Register adds or replaces a delivery Channel.
func (d *Dispatcher) Register(ch Channel) {
	if ch != nil {
		d.channels[ch.Type()] = ch
	}
}

// SendToUser delivers msg to all enrolled targets for userID, pruning stale targets automatically.
func (d *Dispatcher) SendToUser(ctx context.Context, userID int64, msg Message) (DeliveryResult, error) {
	targets, err := d.Store.ListTargets(ctx, userID)
	if err != nil {
		return DeliveryResult{}, err
	}

	var res DeliveryResult
	for _, t := range targets {
		ch, ok := d.channels[t.Channel]
		if !ok {
			res.Failed++
			_ = d.Store.RecordTargetError(ctx, t.ID, fmt.Sprintf("unsupported channel %q", t.Channel))
			continue
		}
		err := ch.Send(ctx, t, msg)
		if err == nil {
			res.Sent++
			_ = d.Store.RecordTargetSuccess(ctx, t.ID)
			continue
		}
		if errors.Is(err, ErrTargetGone) {
			res.Pruned++
			_ = d.Store.DeleteTargetByID(ctx, t.ID)
			continue
		}
		res.Failed++
		_ = d.Store.RecordTargetError(ctx, t.ID, err.Error())
	}
	return res, nil
}
