package api

import (
	"errors"
	"net/http"
	"strconv"

	"itemized/internal/auth"
	"itemized/internal/notify"
)

func (s *Server) handleGetNotificationConfig(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeJSON(w, http.StatusOK, map[string]any{
			"enabled":          false,
			"vapid_public_key": "",
			"timezone":         notify.LocalTimezoneName(),
		})
		return
	}

	keys, err := s.NotifyStore.EnsureVAPIDKeys(r.Context())
	if err != nil {
		writeInternalError(w, "ensure VAPID keys", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":          true,
		"vapid_public_key": keys.PublicKey,
		"timezone":         notify.LocalTimezoneName(),
	})
}

func (s *Server) handleGetNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	prefs, err := s.NotifyStore.GetPreferences(r.Context(), user.ID)
	if err != nil {
		writeInternalError(w, "get notification preferences", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"digest_time":           prefs.DigestTime,
		"expiration_enabled":    prefs.ExpirationEnabled,
		"shopping_list_enabled": prefs.ShoppingListEnabled,
		"timezone":              notify.LocalTimezoneName(),
	})
}

func (s *Server) handleUpdateNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "push notifications are disabled in demo mode")
		return
	}
	user := auth.UserFromContext(r.Context())
	var req struct {
		DigestTime          *string `json:"digest_time"`
		ExpirationEnabled   *bool   `json:"expiration_enabled"`
		ShoppingListEnabled *bool   `json:"shopping_list_enabled"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	current, err := s.NotifyStore.GetPreferences(r.Context(), user.ID)
	if err != nil {
		writeInternalError(w, "load notification preferences", err)
		return
	}
	digestTime := current.DigestTime
	if req.DigestTime != nil {
		digestTime = *req.DigestTime
	}
	expEnabled := current.ExpirationEnabled
	if req.ExpirationEnabled != nil {
		expEnabled = *req.ExpirationEnabled
	}
	shopEnabled := current.ShoppingListEnabled
	if req.ShoppingListEnabled != nil {
		shopEnabled = *req.ShoppingListEnabled
	}

	updated, err := s.NotifyStore.UpdatePreferences(r.Context(), user.ID, digestTime, expEnabled, shopEnabled)
	if errors.Is(err, notify.ErrInvalidDigestTime) {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if err != nil {
		writeInternalError(w, "update notification preferences", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"digest_time":           updated.DigestTime,
		"expiration_enabled":    updated.ExpirationEnabled,
		"shopping_list_enabled": updated.ShoppingListEnabled,
		"timezone":              notify.LocalTimezoneName(),
	})
}

func (s *Server) handleListNotificationTargets(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	targets, err := s.NotifyStore.ListTargetSummaries(r.Context(), user.ID)
	if err != nil {
		writeInternalError(w, "list notification targets", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"targets": targets})
}

func (s *Server) handleCreateNotificationTarget(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "push notifications are disabled in demo mode")
		return
	}
	user := auth.UserFromContext(r.Context())
	var req struct {
		Channel  string `json:"channel"`
		Label    string `json:"label"`
		Endpoint string `json:"endpoint"`
		P256DH   string `json:"p256dh"`
		Auth     string `json:"auth"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Channel == "" {
		req.Channel = notify.ChannelWebPush
	}
	if req.Channel != notify.ChannelWebPush {
		writeError(w, http.StatusUnprocessableEntity, "unsupported notification channel")
		return
	}

	target, err := s.NotifyStore.UpsertWebPushTarget(r.Context(), user.ID, req.Label, notify.WebPushConfig{
		Endpoint: req.Endpoint,
		P256DH:   req.P256DH,
		Auth:     req.Auth,
	})
	if errors.Is(err, notify.ErrInvalidTarget) {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if err != nil {
		writeInternalError(w, "create notification target", err)
		return
	}
	writeJSON(w, http.StatusCreated, target)
}

func (s *Server) handleDeleteNotificationTarget(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "push notifications are disabled in demo mode")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid target id")
		return
	}
	user := auth.UserFromContext(r.Context())
	if err := s.NotifyStore.DeleteTarget(r.Context(), user.ID, id); errors.Is(err, notify.ErrTargetNotFound) {
		writeError(w, http.StatusNotFound, "notification target not found")
		return
	} else if err != nil {
		writeInternalError(w, "delete notification target", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleTestNotification(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "push notifications are disabled in demo mode")
		return
	}
	user := auth.UserFromContext(r.Context())
	targets, err := s.NotifyStore.ListTargets(r.Context(), user.ID)
	if err != nil {
		writeInternalError(w, "list notification targets", err)
		return
	}
	if len(targets) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no devices are enrolled for push notifications")
		return
	}

	res, err := s.NotifyDispatcher.SendToUser(r.Context(), user.ID, notify.Message{
		Topic: notify.TopicTest,
		Title: "Itemized: Test Notification",
		Body:  "Push notifications are working on this device.",
		URL:   "/settings",
		Tag:   "itemized-test",
	})
	if err != nil {
		writeInternalError(w, "send test notification", err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}
