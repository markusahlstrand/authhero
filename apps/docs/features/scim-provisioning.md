---
title: SCIM Inbound Provisioning
description: Provision and deprovision users into AuthHero from an upstream identity provider (Okta, Microsoft Entra ID) over SCIM 2.0, attached to an enterprise connection.
---

# SCIM Inbound Provisioning

AuthHero implements a **SCIM 2.0 server** so an upstream identity provider (Okta, Microsoft Entra ID, OneLogin, …) can provision, update, and deprovision users into an AuthHero tenant automatically. This follows the Auth0 model: SCIM is **inbound provisioning attached to an enterprise connection**, authenticated with a dedicated bearer token and configured through the Management API.

- **Users only.** Groups (`/Groups`) are not supported yet.
- **Per connection.** Each connection has its own SCIM endpoint and its own tokens.
- **Standard pipeline.** Provisioned users flow through the normal user pipeline, so hooks and the outbox fire exactly as they do for any other user write.

## The SCIM endpoint

Each connection exposes a SCIM base URL:

```
https://{your-tenant-domain}/scim/v2/connections/{connection_id}
```

Requests authenticate with a per-connection bearer token:

```
Authorization: Bearer {scim-token}
```

The token is bound to a single connection — a token minted for one connection cannot provision another.

## Enabling SCIM on a connection

SCIM is configured through the Management API. All routes are guarded by the `*:scim_config` and `*:scim_token` scopes.

### 1. Create the SCIM configuration

```http
POST /api/v2/connections/{connection_id}/scim-configuration
Content-Type: application/json

{
  "user_id_attribute": "externalId",
  "mapping": []
}
```

Both fields are optional; omitting `mapping` applies the default mapping (below).

Other configuration routes:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v2/connections/{id}/scim-configuration` | Read the configuration |
| `PATCH` | `/api/v2/connections/{id}/scim-configuration` | Update `user_id_attribute` / `mapping` |
| `DELETE` | `/api/v2/connections/{id}/scim-configuration` | Remove SCIM (also deletes its tokens) |
| `GET` | `/api/v2/connections/{id}/scim-configuration/default-mapping` | The default attribute mapping |

### 2. Mint a SCIM token

```http
POST /api/v2/connections/{connection_id}/scim-configuration/tokens
Content-Type: application/json

{ "scopes": [], "valid_until": "2027-01-01T00:00:00Z" }
```

The response contains the raw `token` **once** — it is stored only as a hash and cannot be retrieved later. Copy it into your IdP's SCIM configuration.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/scim-configuration/tokens` | List token metadata (never the secret) |
| `POST` | `/scim-configuration/tokens` | Mint a token (raw value returned once) |
| `DELETE` | `/scim-configuration/tokens/{token_id}` | Revoke a token |

## Supported SCIM operations

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/Users` | List; supports `filter`, `startIndex` (1-based), `count` |
| `POST` | `/Users` | Create (`409` with `scimType: uniqueness` on duplicate) |
| `POST` | `/Users/.search` | Filter-based search (filter in the request body) |
| `GET` | `/Users/{id}` | `{id}` is the AuthHero `user_id` |
| `PUT` | `/Users/{id}` | Full replace |
| `PATCH` | `/Users/{id}` | Partial update (RFC 7644 PatchOp) |
| `DELETE` | `/Users/{id}` | Delete |
| `GET` | `/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas` | Discovery documents |

### Filtering

The `filter` parameter supports the operators Okta and Entra use for provisioning: `eq` combined with `and` / `or` and parentheses. The common lookup-before-create case — `userName eq "..."` or `externalId eq "..."` — resolves with a targeted query. Unsupported operators return a SCIM `501` with `scimType: invalidFilter`.

```
GET /Users?filter=userName eq "alice@example.com"
```

### PATCH

`add`, `replace`, and `remove` are supported, including pathless value merges, dotted paths (`name.givenName`), and value-filtered multi-valued paths (`emails[type eq "work"].value`). Microsoft Entra's deactivation PATCH is handled:

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [{ "op": "replace", "path": "active", "value": false }]
}
```

## Attribute mapping

The SCIM resource `id` is always the AuthHero `user_id`. The IdP-assigned `externalId` is stored per connection and is used for lookups. The default mapping mirrors Auth0's:

| SCIM attribute | AuthHero field |
|----------------|----------------|
| `userName` | `email` (or `username` when it isn't an address) |
| `emails[primary eq true].value` | `email` |
| `name.givenName` | `given_name` |
| `name.familyName` | `family_name` |
| `displayName` | `name` |
| `active` | inverse of `blocked` |
| `externalId` | stored per connection |

### Deactivation (`active: false`)

Setting `active: false` (via `PUT` or `PATCH`) **blocks** the AuthHero user and **revokes their sessions and refresh tokens**, matching Auth0. A blocked user cannot log in or refresh tokens. Setting `active: true` again unblocks them — provisioning never hard-deletes on deactivation, so the reactivation path Entra expects is preserved.

## Configuring your IdP

- **Microsoft Entra ID** — in the enterprise application's *Provisioning* settings, set the Tenant URL to the SCIM base URL above and the Secret Token to a minted SCIM token. Validate with the [Entra SCIM Validator](https://scimvalidator.microsoft.com/).
- **Okta** — enable provisioning on the app integration, set the SCIM connector base URL and the OAuth bearer token, and run Okta's SCIM spec tests.

SCIM can only be enabled on enterprise-strategy connections (SAML, OIDC, Okta Workforce, Entra) — the same set Auth0 gates SCIM to.

## Audit logging

Every successful SCIM operation writes a `Successful SCIM Operation` (`sscim`) audit log entry, tagged with the connection and the affected user, so provisioning activity appears alongside the rest of the tenant's audit trail.

## Limitations

- **No Groups.** Only the `/Users` resource is implemented.
- **Default mapping.** The per-connection `mapping` is stored but the provisioning path currently applies the default mapping; custom attribute maps are a planned enhancement.
- Compound (non-`eq`) filters fall back to an in-memory scan bounded to the first 1,000 users of the connection; real IdP lookups use the targeted fast path.
