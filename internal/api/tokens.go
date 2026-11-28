package api

import (
	"errors"
	"net/http"

	"itemized/internal/auth"
)

func (s *Server) handleListAPITokens(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeJSON(w, http.StatusOK, map[string]any{"tokens": []auth.APIToken{}})
		return
	}
	u := auth.UserFromContext(r.Context())
	tokens, err := s.Auth.ListAPITokens(r.Context(), u.ID)
	if err != nil {
		writeInternalError(w, "list api tokens", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokens": tokens})
}

func (s *Server) handleCreateAPIToken(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "disabled in demo mode")
		return
	}
	var req struct {
		Name          string `json:"name"`
		ExpiresInDays *int   `json:"expires_in_days"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u := auth.UserFromContext(r.Context())
	rawToken, meta, err := s.Auth.CreateAPIToken(r.Context(), u.ID, req.Name, req.ExpiresInDays)
	if errors.Is(err, auth.ErrInvalidAPITokenName) || errors.Is(err, auth.ErrInvalidAPITokenTTL) {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if err != nil {
		writeInternalError(w, "create api token", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"token":    rawToken,
		"metadata": meta,
	})
}

func (s *Server) handleDeleteAPIToken(w http.ResponseWriter, r *http.Request) {
	if s.DemoMode {
		writeError(w, http.StatusForbidden, "disabled in demo mode")
		return
	}
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid token id")
		return
	}
	u := auth.UserFromContext(r.Context())
	err = s.Auth.RevokeAPIToken(r.Context(), u.ID, id)
	if errors.Is(err, auth.ErrAPITokenNotFound) {
		writeError(w, http.StatusNotFound, "api token not found")
		return
	}
	if err != nil {
		writeInternalError(w, "revoke api token", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
