---
"@authhero/adapter-interfaces": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
"@authhero/aws-adapter": patch
"authhero": patch
---

Honour per-client refresh-token lifetimes instead of tenant session lifetimes.

`client.refresh_token.token_lifetime` / `idle_token_lifetime` (seconds) now
drive a refresh token's absolute and sliding expiry, with
`infinite_token_lifetime`, `infinite_idle_token_lifetime` and
`expiration_type: "non-expiring"` disabling the corresponding expiry
altogether — the setting native and mobile clients rely on, which was
previously unrepresentable. These fields were already stored and exposed in
the admin UI but were never read by the engine, which derived refresh-token
expiry from the tenant's `session_lifetime` / `idle_session_lifetime`
instead.

The tenant lifetimes remain the fallback, so tenants that configure nothing on
the client see no change. The idle window slides by the resolved lifetime on
every exchange, on both the rotating and non-rotating paths. Neither path ever
extends an absolute expiry, and both drop the expiries an existing token was
stamped with once its client is configured never to expire — rotation by
minting the child row from the current config, the in-place path by clearing
the stored columns. The refresh-token adapter `update` payload is typed
accordingly: `null` on `expires_at` / `idle_expires_at` clears the stored
value, `undefined` still leaves it untouched.
