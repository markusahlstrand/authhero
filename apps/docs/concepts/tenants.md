---
title: Tenants
description: Learn about multi-tenancy in AuthHero for isolating users, applications, and settings across customers, environments, or regions.
---

# Tenants

In AuthHero, a tenant represents a logical isolation of users, applications, and authentication settings. Multi-tenancy allows you to manage multiple authentication domains within a single AuthHero instance.

## What is a Tenant?

A tenant is the top-level organizational unit in AuthHero. Each tenant has:

- **Isolated data**: Users, applications, connections, and settings are specific to each tenant
- **Unique configuration**: Custom branding, authentication rules, and security policies
- **Separate domains**: Each tenant can have its own custom domain
- **Independent billing**: For SaaS deployments, tenants typically represent separate customers

## Use Cases

### Multi-Customer SaaS

If you're building a B2B SaaS application, each of your customers would be a separate tenant:

```
Tenant: customer-a
├── Users: customer-a's employees
├── Applications: customer-a's apps
└── Branding: customer-a's logo and colors

Tenant: customer-b
├── Users: customer-b's employees
├── Applications: customer-b's apps
└── Branding: customer-b's logo and colors
```

### Environment Separation

Use tenants to separate development, staging, and production environments:

```
Tenant: dev-environment
Tenant: staging-environment
Tenant: production-environment
```

### Regional Isolation

Separate tenants by geographic region for data residency compliance:

```
Tenant: eu-region
Tenant: us-region
Tenant: apac-region
```

## Tenant Settings

Each tenant has configurable settings including:

- **Authentication**: Allowed login methods, password policies, MFA requirements
- **Session management**: Token lifetimes, refresh token behavior
- **Branding**: Custom logos, colors, email templates
- **Security**: CORS settings, allowed callback URLs
- **Flags**: Feature toggles for experimental or enterprise features

## Multi-Tenancy Architecture

AuthHero supports a control plane pattern where one tenant manages other tenants. This is useful for:

- **Tenant provisioning**: Creating and configuring new tenants programmatically
- **Cross-tenant administration**: Managing users and settings across multiple tenants
- **Billing and analytics**: Aggregating data across all tenants

See the [Multi-Tenancy Package](/packages/multi-tenancy/) for details on implementing multi-tenant architectures.

## Tenant Flags

Tenants support feature flags for enabling/disabling functionality:

### `inherit_global_permissions_in_organizations`

When enabled, users with tenant-level roles will inherit those permissions when accessing organization-scoped resources. This is useful for global administrators who need access to all organizations within a tenant.

**Example:**
```typescript
// User has tenant-level role "admin" with permissions ["read:users", "write:users"]
// When accessing organization "org_123":
// - With flag enabled: Token includes ["read:users", "write:users"]
// - With flag disabled: Token only includes organization-specific permissions
```

See [Organizations](/concepts/organizations) for more details on permission inheritance.

## API Reference

- [GET /api/v2/tenants](/api/endpoints#get-tenants)
- [POST /api/v2/tenants](/api/endpoints#create-tenant)
- [PATCH /api/v2/tenants/:id](/api/endpoints#update-tenant)
- [DELETE /api/v2/tenants/:id](/api/endpoints#delete-tenant)
