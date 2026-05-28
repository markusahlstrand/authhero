---
title: Lazy Migration from Auth0
description: Migrate users from Auth0 to AuthHero gradually, without forcing a password reset and without re-authenticating active sessions.
---

# Lazy Migration from Auth0

Move traffic from an Auth0 tenant to AuthHero one user at a time, without forcing every user to reset their password or re-authenticate the next time they interactively sign in.

**Password fallback** — on a password login, if no local hash matches, AuthHero verifies the password against the upstream Auth0 (Resource Owner Password Realm grant), fetches the user's profile from `/userinfo`, creates the user locally, and stores the hash. Subsequent logins are served entirely by AuthHero.

**Refresh-token re-mint** — when a client presents a refresh token that didn't originate from AuthHero, the configured tenant-level **Migration Source** redeems it at the upstream `/oauth/token` and `/userinfo`, resolves or lazily creates the local user (matched by upstream `sub`), and mints fresh AuthHero tokens. The client keeps using `grant_type=refresh_token` — no SDK change. After one exchange per user, that user is fully on the AuthHero side.

Bulk import via `/api/v2/users-imports` remains useful for other migration shapes; this page covers the lazy/just-in-time approach that needs no client SDK changes.

## Migrating from a version that proxied refresh tokens

If you are upgrading from a release that forwarded refresh tokens upstream, the cutover is now seamless for clients:

- **Configure a Migration Source for the tenant** (see "Enable refresh-token re-mint at the tenant level" below) **before** flipping DNS. Without one, unknown refresh tokens are rejected and clients must re-authenticate.
- **Client impact with a Migration Source configured**: clients holding Auth0-issued refresh tokens get a fresh AuthHero refresh token back on their next exchange — no SDK change, no interactive prompt.
- **Recommended monitoring**: watch the `FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN` log type for the residual spike from tokens the upstream itself rejects (expired, revoked). The volume should fall toward zero as the long tail of users either re-exchanges or expires.

## What you need from Auth0

A regular Auth0 application (typically your existing one) with these settings:

- **Grant Types**: enable `Password` and the extension grant `http://auth0.com/oauth/grant-type/password-realm` under Application → Settings → Advanced → Grant Types.
- **Client ID and Client Secret** of that application — AuthHero uses them to call upstream `/oauth/token` for both password-realm grants and refresh-token grants.
- The Auth0 **Domain** (e.g. `example.auth0.com`).

No Management API M2M token is required for v1 — `/userinfo` is called with the access_token returned by the password-realm grant.

## Configuration

Configure the upstream credentials directly on the DB connection — no separate source connection and no new endpoints. Refresh-token re-mint additionally requires a tenant-level **Migration Source** (see ["Enable refresh-token re-mint at the tenant level"](#enable-refresh-token-re-mint-at-the-tenant-level) below) holding the same upstream credentials.

### Enable lazy import on the database connection

The upstream Auth0 credentials live on the same DB connection users land on (typically `Username-Password-Authentication`), under `options.configuration`. Setting `options.import_mode: true` enables the password fallback:

In the admin UI: edit the connection and toggle **Import Mode** ("On unknown passwords, fall back to upstream Auth0…"), then fill in the upstream **Token Endpoint**, **Userinfo Endpoint**, **Client ID**, and **Client Secret**.

Or via the Management API:

```http
PATCH /api/v2/connections/<db-connection-id>
Content-Type: application/json

{
  "options": {
    "import_mode": true,
    "configuration": {
      "token_endpoint": "https://example.auth0.com/oauth/token",
      "userinfo_endpoint": "https://example.auth0.com/userinfo",
      "client_id": "<auth0-client-id>",
      "client_secret": "<auth0-client-secret>"
    }
  }
}
```

`import_mode` here is the same flag Auth0 uses on its own Custom Database connections — same name, symmetric semantics. AuthHero's password flow will:

1. Try the local password hash first.
2. On miss, read the upstream credentials from this connection's `options.configuration`.
3. Call `POST /oauth/token` with `grant_type=http://auth0.com/oauth/grant-type/password-realm`, `realm=<DB connection name>`, the supplied username/password, and the upstream client credentials.
4. On 200, fetch the profile from `/userinfo` and create the local user (if missing) + bcrypt hash.
5. On any upstream error, surface the existing `INVALID_PASSWORD` rejection so the upstream's existence is not leaked.

### Enable refresh-token re-mint at the tenant level

Refresh tokens don't carry a connection, and a tenant may have several connections (social + DB) sharing the same upstream IdP — so the credentials for re-mint live at the **tenant** level, not on a connection.

```http
POST /api/v2/migration-sources
Content-Type: application/json

{
  "name": "Upstream Auth0",
  "provider": "auth0",
  "connection": "auth0",
  "enabled": true,
  "credentials": {
    "domain": "example.auth0.com",
    "client_id": "<auth0-client-id>",
    "client_secret": "<auth0-client-secret>"
  }
}
```

When AuthHero's refresh-token grant doesn't find a local row for the presented token:

1. List enabled migration sources for the tenant.
2. For each source, call upstream `POST /oauth/token` with `grant_type=refresh_token`.
3. On 200, call `/userinfo` to learn the upstream `sub`.
4. Resolve or lazily create the local user (matched by `provider` + `sub`) — going through the same user-registration hooks as a fresh signup.
5. Mint native AuthHero `access_token` + `id_token` + `refresh_token` and return them.
6. If every source rejects, return `invalid_grant` as before.

The upstream refresh token is dead to AuthHero after one successful exchange — the freshly minted AuthHero refresh token replaces it on the next call. Set `enabled: false` to disable a source without deleting it; flip it off once the upstream traffic drops to zero.

## What happens during a typical migration

| Day | Event | What runs |
| --- | --- | --- |
| 0 | DNS flipped, AuthHero is now serving auth | Local lookups miss; password fallback activates |
| 0 | Clients holding Auth0 refresh tokens hit `/oauth/token` | Migration Source redeems the token upstream, mints fresh AuthHero tokens, returns them |
| 0–N | A user signs in with username/password | Password fallback verifies against Auth0, creates them locally, stores hash |
| N+1 | Migrated user signs in again | Served entirely from AuthHero — no upstream call |
| Eventually | Upstream traffic settles | Disable the Migration Source and the per-connection `import_mode`; decommission the upstream Auth0 tenant |

Once the upstream password-fallback traffic drops to a handful per day you can flip `import_mode` off and decommission the upstream Auth0 tenant.

## Edge cases and gotchas

- **MFA-enforced users**: Auth0 returns `mfa_required` from the password-realm grant. AuthHero treats it as a generic `INVALID_PASSWORD` to avoid leaking that the user exists upstream — affected users must reset on the AuthHero side.
- **`unauthorized_client: Grant type … not allowed`**: the Auth0 application has not been granted the password-realm grant. Enable it under Application → Advanced → Grant Types.
- **Failed-login throttling still applies**: the existing 3-strikes lockout fires whether the password compare runs locally or against upstream, so an attacker can't bypass it by forcing the upstream path.
- **Refresh-token re-mint requires a configured Migration Source**: if none is enabled for the tenant, unrecognized refresh tokens fall back to `invalid_grant` and the client must re-authenticate interactively.
- **Connection name === realm**: AuthHero sends the local DB connection's name as the upstream `realm`. Keep the DB connection's name aligned with the upstream connection name (typically `Username-Password-Authentication`).

## Comparison with the other migration mechanisms

- **Bulk import via `/api/v2/users-imports`** — pre-seeds users (with password hashes if you can extract them) so AuthHero owns the records upfront. Use when you want to flip DNS in one shot rather than draining the upstream incrementally.
- **[Token Exchange (RFC 8693)](https://github.com/markusahlstrand/authhero/issues/807)** — proposed: an explicit `grant_type=token-exchange` surface for callers that prefer signalling the migration in the request rather than relying on transparent fallback. Not yet shipped.
- **Lazy migration (this page)** — no client changes for password logins or refresh tokens; users and refresh tokens are migrated transparently on first use.

These are complementary — most production migrations use lazy migration as the foundation and add bulk import for the long tail of users who never sign in during the migration window.
