package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type OIDCConfig struct {
	Issuer        string
	ClientID      string
	ClientSecret  string
	RedirectURL   string
	AutoProvision bool
}

func (c OIDCConfig) Enabled() bool {
	return strings.TrimSpace(c.Issuer) != "" && strings.TrimSpace(c.ClientID) != ""
}

type pendingOIDCState struct {
	Verifier  string
	Kind      string
	ExpiresAt time.Time
}

type OIDCManager struct {
	mu     sync.Mutex
	states map[string]pendingOIDCState
}

func NewOIDCManager() *OIDCManager {
	return &OIDCManager{
		states: make(map[string]pendingOIDCState),
	}
}

func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (m *OIDCManager) BeginAuth(ctx context.Context, cfg OIDCConfig, sessionKind string) (string, error) {
	if !cfg.Enabled() {
		return "", errors.New("oidc is not configured")
	}
	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return "", fmt.Errorf("discover oidc provider: %w", err)
	}

	state, err := generateRandomToken(24)
	if err != nil {
		return "", err
	}
	verifier, err := generateRandomToken(32)
	if err != nil {
		return "", err
	}

	m.mu.Lock()
	m.pruneLocked()
	m.states[state] = pendingOIDCState{
		Verifier:  verifier,
		Kind:      sessionKind,
		ExpiresAt: time.Now().UTC().Add(10 * time.Minute),
	}
	m.mu.Unlock()

	oauthCfg := oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}

	authURL := oauthCfg.AuthCodeURL(
		state,
		oauth2.SetAuthURLParam("code_challenge", pkceChallenge(verifier)),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
	return authURL, nil
}

type OIDCResult struct {
	Issuer      string
	Subject     string
	Email       string
	SessionKind string
}

func (m *OIDCManager) CompleteAuth(ctx context.Context, cfg OIDCConfig, state, code string) (*OIDCResult, error) {
	if !cfg.Enabled() {
		return nil, errors.New("oidc is not configured")
	}

	m.mu.Lock()
	pending, ok := m.states[state]
	if ok {
		delete(m.states, state)
	}
	m.mu.Unlock()

	if !ok || time.Now().UTC().After(pending.ExpiresAt) {
		return nil, errors.New("invalid or expired oidc state")
	}

	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return nil, fmt.Errorf("discover oidc provider: %w", err)
	}

	oauthCfg := oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}

	token, err := oauthCfg.Exchange(
		ctx,
		code,
		oauth2.SetAuthURLParam("code_verifier", pending.Verifier),
	)
	if err != nil {
		return nil, fmt.Errorf("exchange oidc code: %w", err)
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return nil, errors.New("oidc token response missing id_token")
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.ClientID})
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, fmt.Errorf("verify id_token: %w", err)
	}

	var claims struct {
		Email string `json:"email"`
	}
	_ = idToken.Claims(&claims)

	return &OIDCResult{
		Issuer:      idToken.Issuer,
		Subject:     idToken.Subject,
		Email:       claims.Email,
		SessionKind: pending.Kind,
	}, nil
}

func (m *OIDCManager) pruneLocked() {
	now := time.Now().UTC()
	for k, v := range m.states {
		if now.After(v.ExpiresAt) {
			delete(m.states, k)
		}
	}
}
