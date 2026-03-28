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

## The Multi-Tenancy Package

For advanced multi-tenancy (per-customer databases, subdomain routing, settings inheritance), use the `@authhero/multi-tenancy` package.

See [Architecture — Multi-Tenancy](/architecture/multi-tenancy) for an overview and [Customization — Multi-Tenancy Package](/customization/multi-tenancy/) for implementation details.
