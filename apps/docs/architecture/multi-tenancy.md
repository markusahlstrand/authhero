---
title: Multi-Tenancy
description: How AuthHero handles multi-tenancy — from basic tenant isolation to advanced organization-based multi-tenancy.
---

# Multi-Tenancy

AuthHero is multi-tenant by design. Every API request is scoped to a tenant, and all data is isolated by `tenant_id`.

## Basic Multi-Tenancy (Core)

Built into the core `authhero` package:

- Multiple tenants share the same database
- Data isolation via `tenant_id` column on every table
- Each tenant has its own users, applications, connections, and settings
- Custom branding per tenant
- Management API scoped to the current tenant

This is sufficient for most deployments where you control all tenants.

## Organization-Based Multi-Tenancy

For B2B SaaS applications where your customers need isolated environments, the `@authhero/multi-tenancy` package adds:

- **Control plane** — A main tenant that manages child tenants
- **Per-tenant databases** — Each customer can have their own isolated database
- **Subdomain routing** — Automatic `customer.auth.example.com` → tenant resolution
- **Settings inheritance** — Child tenants inherit configuration from the control plane
- **Entity sync** — Resource servers, roles, and connections can be synced from the control plane to child tenants
- **Token-based access** — JWT tokens with `org_id` claims for organization context

### Organizations

Organizations group users and apply specific access controls. When a user authenticates with an organization context, the access token includes an `org_id` claim that your API uses for tenant-level authorization:

```json
{
  "sub": "auth0|user123",
  "org_id": "org_acme",
  "scope": "openid read:data"
}
```

The same user can belong to multiple organizations with different roles in each.

See [Entities — Organizations](/entities/identity/organizations) for more on the organization model, and [Customization — Multi-Tenancy Package](/customization/multi-tenancy/) for implementation details.
