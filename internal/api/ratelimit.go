package api

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

const (
	defaultLoginRateLimit  = 10
	defaultLoginRateWindow = time.Minute
)

// loginRateLimiter is a lightweight in-memory sliding-window rate limiter keyed
// by client IP and normalized email address.
type loginRateLimiter struct {
	mu          sync.Mutex
	limit       int
	window      time.Duration
	entries     map[string][]time.Time
	lastCleanup time.Time
	nowFunc     func() time.Time
}

func newLoginRateLimiter(limit int, window time.Duration) *loginRateLimiter {
	if limit <= 0 {
		limit = defaultLoginRateLimit
	}
	if window <= 0 {
		window = defaultLoginRateWindow
	}
	return &loginRateLimiter{
		limit:       limit,
		window:      window,
		entries:     make(map[string][]time.Time),
		lastCleanup: time.Now(),
		nowFunc:     time.Now,
	}
}

func (l *loginRateLimiter) Allow(key string) bool {
	if l == nil || key == "" {
		return true
	}
	now := l.nowFunc()
	cutoff := now.Add(-l.window)

	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastCleanup) >= l.window {
		for k, times := range l.entries {
			kept := pruneTimes(times, cutoff)
			if len(kept) == 0 {
				delete(l.entries, k)
			} else {
				l.entries[k] = kept
			}
		}
		l.lastCleanup = now
	}

	kept := pruneTimes(l.entries[key], cutoff)
	if len(kept) >= l.limit {
		l.entries[key] = kept
		return false
	}
	l.entries[key] = append(kept, now)
	return true
}

func pruneTimes(times []time.Time, cutoff time.Time) []time.Time {
	idx := 0
	for idx < len(times) && !times[idx].After(cutoff) {
		idx++
	}
	if idx == 0 {
		return times
	}
	if idx >= len(times) {
		return nil
	}
	return append([]time.Time(nil), times[idx:]...)
}

// clientIP extracts the client IP for rate limiting.
// When trustProxy is false, only r.RemoteAddr is used so spoofed forwarding headers
// cannot bypass rate limiting. When trustProxy is true, X-Forwarded-For is scanned
// right-to-left for the rightmost non-private IP (falling back to the leftmost valid IP,
// then X-Real-IP, then r.RemoteAddr).
func clientIP(r *http.Request, trustProxy bool) string {
	remote := stripPort(r.RemoteAddr)
	if !trustProxy {
		return remote
	}

	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		var leftmostValid string
		for i := len(parts) - 1; i >= 0; i-- {
			cand := stripPort(strings.TrimSpace(parts[i]))
			addr, err := netip.ParseAddr(cand)
			if err != nil {
				continue
			}
			addr = addr.Unmap()
			leftmostValid = addr.String()
			if !isPrivateOrLocal(addr) {
				return addr.String()
			}
		}
		if leftmostValid != "" {
			return leftmostValid
		}
	}

	if xri := stripPort(strings.TrimSpace(r.Header.Get("X-Real-IP"))); xri != "" {
		if addr, err := netip.ParseAddr(xri); err == nil {
			return addr.Unmap().String()
		}
	}

	return remote
}

func stripPort(addr string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return strings.Trim(addr, "[]")
}

func isPrivateOrLocal(addr netip.Addr) bool {
	return addr.IsLoopback() ||
		addr.IsPrivate() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsUnspecified()
}
