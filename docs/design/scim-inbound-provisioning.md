# Design: SCIM 2.0 Inbound Provisioning (SCIM Server)

- **Status:** Phases 1–2 implemented (see §8); the rest is still design. Where
  this document and the shipped behavior differ, the user-facing reference is
  `apps/docs/features/scim-provisioning.md`.
- **Author:** Markus Ahlstrand
- **Created:** 2026-08-02
- **Related:** seeded management scopes `*:scim_config` / `*:scim_token` (`packages/authhero/src/seed.ts`), `sscim` log type (`packages/adapter-interfaces/src/types/Logs.ts`), hooks/outbox milestone #1 (outbound SCIM later), transactional outbox #1057
- **Tracking issue:** markusahlstrand/authhero#1191
- **Out of scope:** outbound SCIM (AuthHero as SCIM _client_ pushing users to downstream apps) — see §10

---

## 1. Summary

Add a SCIM 2.0 server so upstream identity providers (Okta, Microsoft Entra ID, OneLogin,
…) can provision, update, and deprovision users into AuthHero. This follows Auth0's model:
SCIM is **inbound provisioning attached to an enterprise connection**, authenticated with
dedicated long-lived SCIM tokens, configured through the management API.

The repo already carried the Auth0-parity vocabulary — management scopes
(`read/create/update/delete:scim_config`, `create/read/delete:scim_token`) and the `sscim`
("Successful SCIM Operation") log type — with no implementation behind them. This design
filled that in: the adapters, management API, `/scim/v2` route module and `/Users` CRUD
described below are implemented.

Users only, `/Groups` deferred: Auth0's `/Groups` is newer / Early-Access (see §2.1), and
both Okta and Entra can provision users-only. Group mapping (→ roles or organizations) is
deferred, not precluded.

## 2. Endpoint surface

### 2.1 SCIM protocol endpoints (new route module `src/routes/scim/`)

Mounted per connection, matching Auth0's path shape (verified against Auth0 docs —
connection **id**, under `/connections/`, not connection name):

```text
BASE = /scim/v2/connections/{connection_id}
```

| Method | Path                         | Notes                                                      |
| ------ | ---------------------------- | ---------------------------------------------------------- |
| GET    | `/Users`                     | ListResponse; supports `filter`, `startIndex`, `count`     |
| POST   | `/Users`                     | Create; 409 `uniqueness` scimType on duplicate             |
| POST   | `/Users/.search`             | Filter-based search (Auth0's SEARCH; used by Entra/Okta)   |
| GET    | `/Users/{id}`                | `{id}` = AuthHero `user_id` (Auth0: SCIM `id` = `user_id`) |
| PUT    | `/Users/{id}`                | Full replace (Okta's primary update verb)                  |
| PATCH  | `/Users/{id}`                | RFC 7644 PatchOp incl. path filters (Entra's update verb)  |
| DELETE | `/Users/{id}`                | Hard delete                                                |
| GET    | `/ServiceProviderConfig`     | Capability document (see §6)                               |
| GET    | `/ResourceTypes`, `/Schemas` | Static discovery documents                                 |

Tenant resolution reuses the existing host/tenant middleware; the connection is resolved
from `{connection_id}` within that tenant and must be an enterprise-strategy connection
(SAML, OIDC, Okta Workforce, or Entra — the strategies Auth0 gates SCIM to) with SCIM
enabled.

**Groups (`/Groups`) are deferred, not unsupported by parity.** Auth0 does document a
`/Groups` endpoint (users-only membership, `displayName` unique per connection), but it is
newer / Early-Access and gated through account teams. Deferring it is a scoping decision;
when it lands it would map to AuthHero roles or organizations (an open design question).

### 2.2 Management API (new module `management-api/scim.ts`, Auth0-parity paths)

```text
GET/POST/PATCH/DELETE  /api/v2/connections/{id}/scim-configuration
GET                    /api/v2/connections/{id}/scim-configuration/default-mapping
GET/POST               /api/v2/connections/{id}/scim-configuration/tokens
DELETE                 /api/v2/connections/{id}/scim-configuration/tokens/{tokenId}
```

Guarded by the already-seeded scopes. Response shapes mirror Auth0
(per `feedback_match_auth0`): configuration carries `connection_id`, `connection_name`,
`strategy`, `mapping` (array of `{ scim, auth0 }` attribute pairs), `user_id_attribute`,
timestamps; token creation returns the raw token **once**, list returns metadata only.

## 3. Data model & adapters

Two new entities in `adapter-interfaces` with drizzle + kysely implementations:

- **`scim_configurations`** — one per connection: `tenant_id`, `connection_id`,
  `user_id_attribute`, `mapping` (JSON), timestamps.
- **`scim_tokens`** — per configuration: `tenant_id`, `connection_id`, `token_id`,
  `token_hash` (SHA-256 of the raw secret; raw value never stored), `scopes`,
  `valid_until` (nullable), `created_at`, `last_used_at`.

**externalId mapping.** IdPs look users up by `externalId eq "…"` before creating, so the
value must be stored and queryable. Recommendation: a third small table
**`scim_external_ids`** (`tenant_id`, `connection_id`, `external_id`, `user_id`, unique on
the first three) rather than a column on `users` — it keeps the (per-connection) SCIM
concern out of the shared user schema and both adapters gain one isolated table.
Alternative considered: `external_id` column on `users` (simpler joins, but pollutes the
core schema and is wrong if a linked user has identities in multiple SCIM connections).

## 4. Authentication

`Authorization: Bearer <scim-token>` on all `/scim/v2` routes. Middleware resolves
tenant + connection, hashes the presented token, and matches it against `scim_tokens` for
that connection (checking `valid_until` and the token's scopes). No client credentials, no
JWT — matching Auth0. Failures return the SCIM error body with `status: 401` (or `403` for
a token missing the scope for the operation), not the OAuth error shape.

## 5. User mapping & write semantics

- Default mapping mirrors Auth0's default (`userName` → `email`, `name.givenName` →
  `given_name`, `name.familyName` → `family_name`, `emails[primary eq true].value` →
  `email`, `active` → ¬`blocked`, `externalId` → mapping table). **Shipped state:**
  `scim-configuration.mapping` is stored and returned, but the provisioning path applies
  the default mapping regardless; per-connection overrides are still to do.
- SCIM creates/updates/deletes flow through the **existing user pipeline** (the same
  helpers the management API uses), so hooks, outbox events, and logs fire exactly as for
  any other user write. SCIM must not become a side door that skips the outbox.
- Provisioned users belong to the connection's strategy/provider; `user_id` is the SCIM
  resource `id`.

**Decided — `active: false`.** Auth0 maps deactivation to `blocked: true` (it "reverses the
value and sets `blocked`") **and terminates all of the user's sessions**. AuthHero had no
`blocked` field, so it was added as its own Auth0-parity change, enforced at login and on
refresh; SCIM `active` maps onto its inverse, and a deactivating write revokes the user's
sessions + refresh tokens. `blocked` lives on the cluster root (login resolves the primary),
so a write targeting a linked identity still lands there. Delete-on-deactivate was rejected:
it loses the reactivation path Entra expects.

## 6. Protocol mechanics

The two genuinely fiddly parts are bought, not built:

- **Filter grammar** (RFC 7644 §3.4.2.2): parse with `scim2-parse-filter` (npm). Auth0
  supports the `eq`, `and`, and `or` operators; we evaluate what real IdPs send — `eq` on
  `userName` and `externalId` (plus `emails`), combined with `and`/`or` — and return HTTP
  501 with a proper SCIM error for unsupported expressions.
- **PATCH**: apply with `scim-patch` (npm), which implements PatchOp incl. value-path
  filters (`emails[type eq "work"].value`). Entra requires this.

Everything else is hand-rolled Hono/zod-openapi routes like the rest of the package:
ListResponse envelope, **1-based** `startIndex` pagination, SCIM error format
(`urn:ietf:params:scim:api:messages:2.0:Error` with `scimType`), `meta` blocks.
`ServiceProviderConfig` advertises honestly: `patch: true`, `filter: true` (with
`maxResults`), `bulk: false`, `sort: false`, `etag: false`, `changePassword: false` —
same capability set Auth0 exposes.

Every successful operation writes an `sscim` log entry (type already defined).

## 7. Testing

No OIDF-style conformance/certification program exists for SCIM. Strategy:

1. **Vitest integration tests** (primary, in-repo, in-process Hono `testClient` like all
   other route tests): token auth, CRUD, mapping, error shapes — plus **fixture-replay
   tests** of the literal request sequences Okta and Entra send during provisioning
   (lookup-by-filter → create → PATCH → deactivate). These fixtures come from vendor docs
   and from captured traffic during validator runs.
2. **Dev-time sanity sweep**: `uvx scim2-tester <url>` (maintained RFC checker) run
   locally while building; anything it flags gets pinned as a vitest case. Not added to CI
   (Python toolchain, one-time discovery value).
3. **Pre-release gate**: Microsoft Entra SCIM Validator (scimvalidator.microsoft.com,
   against a tunnel to the demo app) and Okta's SCIM spec test suite
   (Runscope/BlazeMeter). "Entra and Okta can provision against us" is the claim that
   matters commercially.

The abandoned wso2-incubator suite was evaluated and rejected (dead since 2021).

## 8. Phasing

1. ~~**Phase 1 — config plumbing**: `scim_configurations` / `scim_tokens` /
   `scim_external_ids` entities + adapters (drizzle, kysely), management API module, token
   hashing.~~ Done.
2. ~~**Phase 2 — SCIM endpoints**: route module, auth middleware, `/Users` CRUD with
   filter + PATCH, discovery endpoints, `blocked` field on users, `sscim` logging.~~ Done.
   The filter grammar and PATCH applier are hand-rolled rather than the npm packages named
   in §6, scoped to the operator/op set real IdPs send.
3. **Phase 3 — validation & docs** (remaining): fixture-replay tests, Entra validator +
   Okta suite runs against the demo app, admin UI screen for enabling SCIM + minting tokens
   on a connection. The VitePress guide has landed
   (`apps/docs/features/scim-provisioning.md`).
4. **Later**: per-connection attribute mapping applied on the provisioning path, `/Groups`.

## 9. Open questions

- `user_id_attribute` default: Auth0 uses `externalId` for most strategies but
  `userName` for some — confirm per-strategy defaults we want to honor.
- ~~Should SCIM-created users require the connection to have signup enabled, or does
  provisioning bypass `disable_signup`?~~ Resolved: provisioning bypasses it, as an
  admin-plane write.
- Rate limiting on `/scim/v2` — reuse the existing rate-limit adapter with a per-token
  bucket?

## 10. Later: outbound SCIM (client)

AuthHero pushing users to downstream SCIM servers is an eventing problem — user
created/updated/deleted → deliver to N configured endpoints with retries — i.e. a
consumer of the hooks/outbox work (milestone #1), not part of this design. There is no
Auth0 API to mirror (Auth0 has no outbound SCIM), so it will need its own configuration
design once the outbox delivery guarantees land.
