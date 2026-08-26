---
"@authhero/adapter-interfaces": patch
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
every exchange, on both the rotating and non-rotating paths; rotation still
never extends the absolute expiry, except that a client switched to
non-expiring drops the expiries its existing tokens inherited.
