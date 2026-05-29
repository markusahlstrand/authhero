---
"@authhero/adapter-interfaces": minor
"authhero": minor
---

Add support for Client ID Metadata Documents (CIMD)

The authorization server can now accept an https URL as the `client_id`, fetching and validating the client's metadata document at request time instead of requiring pre-registration or DCR. This is the preferred MCP client-registration mechanism (SEP-991) and mirrors Auth0's CIMD support.

- New per-tenant flag `client_id_metadata_document_registration` (matches Auth0). When enabled, the AS metadata advertises `client_id_metadata_document_supported: true`.
- Added the RFC 8414 `.well-known/oauth-authorization-server` metadata endpoint alongside `.well-known/openid-configuration`.
- CIMD clients are resolved ephemerally (no DB record), validated against Auth0's ruleset (URL constraints, document `client_id` must match the URL, supported grant types / auth methods), fetched over SSRF-safe HTTPS, and required to use PKCE (S256) for code flows.
