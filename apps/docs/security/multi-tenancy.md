---
title: Multi-Tenancy & Organizations
description: Security aspects of multi-tenancy and organization-level authorization in AuthHero.
---

# Multi-Tenancy & Organizations

## Tenant Isolation

AuthHero enforces strict tenant isolation:

- Every database query includes a `tenant_id` filter
- Management API tokens are scoped to a single tenant
- Cross-tenant data access is not possible through the API
- Each tenant has its own signing keys, settings, and branding

## Organization Authorization

Organizations add a second layer of access control within a tenant. When a user authenticates with an organization:

```http
GET /authorize?organization=org_acme&...
```

The resulting token includes `org_id`:

```json
{
  "sub": "auth0|user123",
  "org_id": "org_acme",
  "scope": "openid read:data"
}
```

### Enforcing Organization Access

Your API should validate the `org_id` claim:

```javascript
if (token.org_id !== resource.organizationId) {
  throw new ForbiddenError('Access denied');
}
```

### Organization Membership

Users must be members of an organization to authenticate with its context. Non-members receive a 403 error.

### Organization-Scoped Roles

The same user can have different roles in different organizations:

```
Alice in Acme Corp:    Admin  → read:users, write:users, delete:users
Alice in Widget Inc:   Viewer → read:users
```

## Control-Plane Service Tokens

Some machine-to-machine (M2M) clients — for example the auth service's own email and SMS senders — are registered **once in the control-plane tenant** rather than duplicated into every request tenant. When AuthHero needs to mint a service token for such a client, it first looks for the client in the request tenant and, only if it's missing there, falls back to resolving it against the control plane.

When the fallback fires, the resulting token is minted **in the tenant where the client actually lives**: the `client_grant` records, the signing key, and the `tenant_id` claim all follow the control-plane tenant, not the request tenant.

### How the control plane is resolved

The control plane comes from `multiTenancyConfig` (set by `withRuntimeFallback` in the `@authhero/multi-tenancy` package):

- `resolveControlPlane({ tenant_id })` — a per-tenant resolver, when configured. Returning `undefined` **opts that tenant out** of control-plane inheritance.
- `controlPlaneTenantId` — the static fallback used when no resolver is set.

If neither is configured, there is no fallback and the token mint fails closed with `Client not found`.

### Trust boundary

The fallback deliberately crosses the tenant-isolation boundary, so it is **gated to operator-deployed code only**. It is reachable from:

- AuthHero's built-in email/MFA senders.
- Custom email/SMS service adapters that the operator injects at deploy time (these choose the `clientId`).

It is **not** reachable from tenant-supplied or externally driven code:

- **Hook code** (the `token.createServiceToken(...)` API passed to webhooks/code hooks) never enables the fallback — a hook cannot mint a token in the control plane.
- **Actions** (credentials-exchange code hooks) get an even narrower surface: their token API is hardwired to the request tenant and cannot name a `clientId` at all.
- Nothing reachable over **HTTP / end-user input** can trigger it — the minter is an in-process function, never exposed on a route.

On top of all of this, even an opted-in caller is still bounded by `client_grant` records: it can only obtain a token for an `(audience, scope)` the control-plane client is actually granted. The fallback expands *which tenant* a trusted caller can mint in — it never expands *what* can be minted.

## The Multi-Tenancy Package

For advanced multi-tenancy (per-customer databases, subdomain routing, settings inheritance), use the `@authhero/multi-tenancy` package.

See [Architecture — Multi-Tenancy](/architecture/multi-tenancy) for an overview and [Customization — Multi-Tenancy Package](/customization/multi-tenancy/) for implementation details.
