---
title: Troubleshooting
description: Solutions to common AuthHero issues including authentication problems, token validation errors, database issues, custom domains, and API errors.
---

# Troubleshooting

This guide covers the failures people actually hit when running AuthHero, what causes each one, and where to look next.

Almost every failure is recorded per tenant. Before you start guessing, open the tenant's logs — in the admin dashboard, or over the Management API at `GET /api/v2/logs` — and find the entry for the failed attempt. See [Audit logging](/features/audit-logging) for what each log type means.

## Authentication Issues

### Login Fails

**`400 Invalid redirect URI - <uri>` from `/authorize`**

The `redirect_uri` did not match any of the application's **Allowed Callback URLs**. Matching is strict by design (OAuth 2.0 [RFC 6749](/standards/rfc-6749) §3.1.2.3):

- The scheme must match exactly — `http://localhost:3000/cb` does not match a registered `https://localhost:3000/cb`.
- The path must match exactly, unless the registered entry contains a `*` wildcard.
- The host must match exactly, unless the registered entry starts with `*.` (subdomain wildcards need at least three labels and an `http`/`https` scheme).
- For an exact (non-wildcard) registration, the query string must match too: every registered parameter must be present with the same values, and the request may not add parameters the registration does not pin. A URL that is otherwise correct but carries an extra `?foo=bar` is rejected.

The auth server's own issuer and universal-login URLs are always accepted as callbacks, so flows that return to AuthHero itself do not need to be registered.

**`403 USER_NOT_FOUND`**

No user matched the identifier for this tenant and connection. The usual causes are logging in against the wrong tenant (see [Wrong tenant, or none](#wrong-tenant-or-none) below) and typing an identifier that was never created — the Docker seed creates the username `admin`, not `admin@example.com`. See [Your first login](/first-login) for exactly what the first run creates.

**`403 INVALID_PASSWORD`**

The identifier resolved to a user, but the password did not verify. If the user signed up through a social or passwordless connection they may have no password at all; check the user's identities in the dashboard.

**`403 TOO_MANY_FAILED_LOGINS`**

Per-user lockout: three failed password attempts within a rolling five-minute window. It is counted per user, not per IP, and it expires on its own — there is nothing to unblock. Other authentication methods (OTP, social login) are deliberately left working, so a locked-out user can still get in by email code.

**`429 TOO_MANY_REQUESTS`**

Suspicious-IP throttling, keyed on `{tenant}:{ip}` before the password is even checked. It only runs when the deployment supplies a rate-limit adapter _and_ the tenant has `attack_protection.suspicious_ip_throttling.enabled` set; addresses in that setting's `allowlist` skip it. The threshold lives in the rate-limit binding, not in the tenant settings. If the adapter itself throws, the check fails open and the login proceeds.

**`403 USER_BLOCKED` / `403 EMAIL_NOT_VERIFIED`**

Both are deliberate refusals. `USER_BLOCKED` means the user record is blocked — unblock it in the dashboard. `EMAIL_NOT_VERIFIED` means the connection requires a verified email before password login; re-send the verification email, or verify the address on the user record.

**`400 unauthorized_client` from `/oauth/token`**

The client has a non-empty `grant_types` list that does not include the grant you used. Add the grant type to the application, or leave `grant_types` empty to allow all of them.

**Wrong tenant, or none** {#wrong-tenant-or-none}

Every request is tenant-scoped, and the tenant is resolved in this order:

1. The authenticated user's tenant.
2. The `tenant-id` header (legacy, for API calls).
3. A tenant subdomain of the issuer apex — `{tenant_id}.{issuer host}`. The label _is_ the tenant id, and the tenant must exist or the request 404s with `Tenant not found`.
4. A custom-domain lookup, for hosts outside the issuer apex.
5. A `tenant_id` query parameter (used by enrollment ticket URLs).
6. Single-tenant auto-detect: if exactly one tenant exists, it is used.

Step 6 is why a single-tenant dev server "just works" and a second tenant appears to break it. See [Multi-tenancy](/architecture/multi-tenancy).

### Token Validation Errors

**`iss` does not match**

`ISSUER` is used verbatim as the `iss` claim — including the trailing slash. If your configured value is `http://localhost:3000/` and your SDK is configured with `http://localhost:3000`, strict validators reject every token. Fix the mismatch on the client side, or set `ISSUER` to the exact string you want in the claim; do not expect AuthHero to normalize it. A request that arrives on a custom domain issues `https://<custom domain>/` instead, which is a different issuer from the apex.

**`kid` not found in the JWKS**

Signing keys are per tenant and published at `/.well-known/jwks.json` **for the tenant the request resolves to**. Two things usually go wrong:

- The response is cached (the endpoint sets a long `max-age`), so a client can hold a keyset from before a key rotation. Re-fetch the JWKS on an unknown `kid` — every Auth0-compatible SDK does this already.
- The keyset is empty. That means the resolved tenant has no signing key, not that the token is bad — check that you are hitting the right host, and that the tenant was seeded.

**`401 invalid_token` from `/userinfo`**

The access token is expired, revoked, or was issued for a different audience. Decode it (do not trust it) and compare `iss`, `aud` and `exp` against the server you are calling.

**`invalid_client` from `/oauth/token`**

Client authentication failed — a wrong `client_secret`, a private-key-JWT assertion that does not verify, or an assertion that has already been used. Assertions are single-use.

### Refresh Token Problems

**No refresh token in the response**

A refresh token is only minted when `offline_access` is in the requested scope. Add it to the `/authorize` request; adding it at `/oauth/token` is too late.

**`invalid_grant` when refreshing**

The `error_description` distinguishes the cases:

| `error_description`              | What happened                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Invalid refresh token`          | No stored token matches the value presented (and no configured migration source accepted it).                                                                                                                                        |
| `Invalid grant`                  | The token exists but was issued to a different `client_id`.                                                                                                                                                                          |
| `Refresh token has been revoked` | The token was revoked explicitly — or its whole family was revoked by reuse detection (below).                                                                                                                                       |
| `Refresh token has expired`      | Either the absolute `expires_at` or the idle `idle_expires_at` has passed. Idle expiry is the one people forget: an app that goes quiet for longer than the idle window loses the token even though the absolute lifetime is intact. |

**Reuse detection revoked the family**

Rotation is one-shot: presenting a token that was already rotated more than the client's `refresh_token.leeway` (default 30 seconds) revokes the entire token family, and every sibling stops working. The leeway exists so that a racing pair of requests from the same app does not trigger it; a client that persists tokens badly, or two devices sharing one token, will keep tripping it. Set the leeway on the application if your client legitimately retries slowly.

**Refresh fails with 403 instead of 400**

Both are expected. `invalid_grant` is returned as **403** by default, matching Auth0; set the application's `auth0_conformant` to `false` to get the **400** that [RFC 6749](/standards/rfc-6749) §5.2 mandates.

## Database Issues

**`no such table` / `relation does not exist`**

Migrations have not been applied to the database the server is pointed at. Migrations are _not_ run on boot.

- **Drizzle** (the primary adapter) ships pre-generated migrations inside the package, at `node_modules/@authhero/drizzle/drizzle`. Scaffolded projects run them with `npm run migrate`. Do not generate your own — the schema is owned by AuthHero, and a locally generated migration will diverge on the next upgrade.
- **Kysely** exposes `migrateToLatest(db)` (and `migrateDown(db)`) from `@authhero/kysely-adapter`; call it from your own migration script.

See [Database integration](/database/integration) for the setup, and [Schema](/database/schema) for what the tables hold.

**Decryption failures after a restart or redeploy**

If `ENCRYPTION_KEY` is set, credential fields are encrypted at rest. Changing or losing the key makes previously written values unreadable — the rows are still there, they just cannot be decrypted. Keep the key with the database, not with the deployment. See [Encryption at rest](/security/encryption-at-rest).

**The wrong database entirely**

Local SQLite templates default to `db.sqlite` **in the process's working directory**. Starting the server from a different directory silently creates a fresh, empty database instead of failing. If your tenant "disappeared", check where the file actually is before debugging anything else.

## Custom Domain Issues

**The domain resolves but the tenant does not**

The custom-domain lookup is an exact, lowercased match against the `custom_domains` records. `x-forwarded-host` is checked before the `host` header, so a proxy that rewrites `Host` to the upstream address breaks resolution unless it also sets `x-forwarded-host`.

**A "custom domain" under the issuer apex 404s with `Tenant not found`**

Hosts on the issuer apex are treated as tenant subdomains and are never probed as custom domains. `acme.auth.example.com` means "tenant `acme`", so registering it as a custom domain has no effect — and if no tenant `acme` exists, the request 404s. Pick a host outside the apex, or name the tenant after the label.

**Tokens issued on the custom domain are rejected**

Requests on a custom domain issue `https://<custom domain>/` as `iss`, and the metadata and JWKS are served from that host too. A client pinned to the apex issuer will reject those tokens. Pin the client to one host and use it consistently. See [Custom domain setup](/deployment/custom-domain-setup).

## API Issues

**`401` from the Management API**

The access token is missing, expired, or lacks the scope for the endpoint. Management scopes are per resource (`read:users`, `update:users`, …) — see [Management API security](/security/management-api).

**`403` where you expected `404` (or the reverse)**

`403` means the token is valid but not permitted. A `404` on a resource you know exists usually means the request resolved to a _different tenant_: re-read the resolution order in [Wrong tenant, or none](#wrong-tenant-or-none).

**CORS: the browser blocks the request**

The two CORS surfaces behave differently on purpose:

- `/oauth/token` and `/oauth/revoke` reflect whatever `Origin` is presented, allow `POST` only, and allow the `Tenant-Id`, `Content-Type`, `Auth0-Client` and `Upgrade-Insecure-Requests` request headers. A `GET` to the token endpoint from a browser will fail preflight — that is correct.
- The Management API is restrictive. An origin is allowed if it is in the server's `allowedOrigins` config, or if it appears in the `web_origins` of one of the resolved tenant's applications. Browsers never send custom headers on a preflight, so the `tenant-id` header cannot help there; the tenant is resolved from the request host instead. If a preflight comes back `204` with no CORS headers, the origin was not allowed — add it to the application's **Allowed Web Origins**.

**Pagination or filtering behaves unexpectedly**

See [Pagination](/api/pagination) for `page` / `per_page` / `include_totals`, and [Endpoints](/api/endpoints) for the Lucene-style `q` syntax.

## Common Error Codes

OAuth-style errors on `/authorize`, `/oauth/token` and `/oauth/revoke` follow [RFC 6749](/standards/rfc-6749): a JSON body with `error` and `error_description`.

| `error`                                            | Typical cause                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_request`                                  | A required parameter is missing, repeated, or malformed.                                                                          |
| `invalid_client`                                   | Client authentication failed (bad secret, bad or replayed assertion).                                                             |
| `invalid_grant`                                    | The code, refresh token or assertion is unknown, expired, revoked, or was issued to another client.                               |
| `unauthorized_client`                              | The client is not allowed to use this grant type.                                                                                 |
| `unsupported_grant_type`                           | The `grant_type` is not supported by the server.                                                                                  |
| `invalid_scope`                                    | A requested scope is unknown or not permitted for this client.                                                                    |
| `unsupported_response_mode`                        | `response_mode=query` was combined with a response type that carries a token.                                                     |
| `invalid_redirect_uri` / `invalid_client_metadata` | Dynamic Client Registration only ([RFC 7591](/standards/rfc-7591)): the submitted redirect URIs or client metadata were rejected. |
| `access_denied`                                    | The user or policy refused the request.                                                                                           |
| `login_required` / `consent_required`              | Returned to `prompt=none` requests that cannot be completed silently.                                                             |
| `server_error`                                     | An unexpected failure; check the server logs.                                                                                     |

Errors from the interactive login flow use a `code`/`message` shape instead:

| `code`                   | Status | Meaning                                              |
| ------------------------ | ------ | ---------------------------------------------------- |
| `USER_NOT_FOUND`         | 403    | No user matched the identifier for this tenant.      |
| `INVALID_PASSWORD`       | 403    | The password did not verify.                         |
| `TOO_MANY_FAILED_LOGINS` | 403    | Three failed attempts in five minutes for this user. |
| `USER_BLOCKED`           | 403    | The user record is blocked.                          |
| `EMAIL_NOT_VERIFIED`     | 403    | The connection requires a verified email address.    |
| `TOO_MANY_REQUESTS`      | 429    | Suspicious-IP throttling rejected the attempt.       |

Management API error codes are listed in [Error codes](/api/error-codes).

## Getting Help

If you can't resolve your issue using this guide, you can:

1. Search the [GitHub issues](https://github.com/markusahlstrand/authhero/issues) for similar problems
2. Open a new issue with the failing request, the response body, and the matching tenant log entry
3. Reach out to the community for help
