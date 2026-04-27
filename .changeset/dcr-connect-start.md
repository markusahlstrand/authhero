---
"authhero": minor
"@authhero/adapter-interfaces": patch
"@authhero/kysely-adapter": patch
---

Add Phases 4 and 5 of RFC 7591/7592 Dynamic Client Registration.

**Phase 4 — consent-mediated DCR**

- New top-level `GET /connect/start?integration_type=...&domain=...&return_to=...&state=...&scope=...` route validates the request, creates a login session, and 302s to `/u2/connect/start`. The Stencil widget renders a consent screen there; on confirm AuthHero mints an IAT bound to the consenting user (with `domain`, `integration_type`, `scope`, and `grant_types: ["client_credentials"]` as pre-bound constraints) and redirects to `return_to?authhero_iat=<token>&state=<state>`. Cancel returns `authhero_error=cancelled`.
- New `POST /api/v2/client-registration-tokens` (scope `create:client_registration_tokens` or `auth:write`) for non-browser IAT issuance. Body: `{ sub?, constraints?, expires_in_seconds?, single_use? }` — defaults to 5-minute TTL and single-use.
- New tenant flag `dcr_allowed_integration_types: string[]` allowlists the `integration_type` values accepted by `/connect/start`.
- New management scope `create:client_registration_tokens` added to `MANAGEMENT_API_SCOPES`.

**Phase 5 — owner scoping & soft-delete enforcement**

- New `GET /api/v2/users/{user_id}/connected-clients` Management API endpoint returns clients owned by a user (created via IAT-gated DCR). Response is a slim projection — no secrets, no internal config — and excludes soft-deleted clients.
- `getEnrichedClient` now treats clients with `client_metadata.status === "deleted"` as not found. After RFC 7592 `DELETE /oidc/register/{client_id}`, subsequent `/oauth/token`, `/authorize`, and resume requests for that `client_id` are rejected.
- The kysely `clients.list` adapter now supports lucene-style `field:"value"` exact-match filtering on `owner_user_id` and `registration_type`.
