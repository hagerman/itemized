package api

import "net/http"

// ErrorSpec describes a canonical HTTP error status returned by the Itemized API.
type ErrorSpec struct {
	Status  int
	Code    string
	Meaning string
}

// ErrorCatalog lists every HTTP error status code the Itemized API can send.
// Keep in sync with docs/api.md (verified by internal/docsverify).
var ErrorCatalog = []ErrorSpec{
	{Status: http.StatusBadRequest, Code: "invalid json", Meaning: "Malformed JSON body, invalid path ID, or invalid request parameters."},
	{Status: http.StatusUnauthorized, Code: "unauthorized", Meaning: "Missing, expired, or invalid session cookie or login credentials."},
	{Status: http.StatusForbidden, Code: "forbidden", Meaning: "Action requires administrator role, setup is already complete, or action is disabled in demo mode."},
	{Status: http.StatusNotFound, Code: "not found", Meaning: "Requested route or resource (product, item, category, location, user, printer) does not exist."},
	{Status: http.StatusConflict, Code: "conflict", Meaning: "Uniqueness or referential integrity conflict (duplicate product name, email in use, or resource in use)."},
	{Status: http.StatusRequestEntityTooLarge, Code: "request body too large", Meaning: "JSON request body exceeded the 1 MiB limit."},
	{Status: http.StatusUnprocessableEntity, Code: "validation error", Meaning: "Request JSON was valid but failed domain validation (missing required fields, invalid hierarchy, or invalid template)."},
	{Status: http.StatusTooManyRequests, Code: "rate limited", Meaning: "Too many login attempts or demo-mode UPC lookups in the rate-limit window."},
	{Status: http.StatusInternalServerError, Code: "internal server error", Meaning: "Unexpected server or database error."},
	{Status: http.StatusBadGateway, Code: "upstream unavailable", Meaning: "External OIDC, OpenFoodFacts, LLM, or LAN printer endpoint failed or could not be reached."},
}
