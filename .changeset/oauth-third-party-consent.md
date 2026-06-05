---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"authhero": minor
---

Enforce OAuth consent for third-party clients on both silent and interactive auth flows.

- `client.is_first_party` now defaults to `true`. A new kysely migration flips existing clients to `is_first_party = true`, preserving today's no-consent UX. Clients that should be treated as third-party must now set `is_first_party = false` explicitly.
- New `grants` table and `GrantsAdapter` interface store granted scope per `(tenant, user, clientID, audience)`. Wire shape matches Auth0's `/api/v2/grants` exactly — including the `clientID` (camelCase) field name.
- Silent auth (`prompt=none`) for a third-party client returns the OIDC `consent_required` error when the requested scopes are not covered by a stored grant. Basic OIDC scopes (`openid`, `profile`, `email`) are exempt.
- Interactive auth for a third-party client redirects to a new `/u2/consent` screen before issuing a code. Approving the screen records the grant and resumes the original flow.
- New `LoginSessionState.AWAITING_CONSENT` with `REQUIRE_CONSENT` / `COMPLETE_CONSENT` transitions.
- Management API: `GET /api/v2/grants`, `DELETE /api/v2/grants/{id}`, and `DELETE /api/v2/grants?user_id=...` — mirrors Auth0's surface. The earlier `/users/{id}/consents` endpoint has been removed.
- Admin UI: new read-only "Grants" tab on the user detail page.