---
title: Multi-Tenancy Architecture
description: Organization-based multi-tenancy model with control plane management, token-based access control, and organization-tenant relationships.
---

# Architecture

The multi-tenancy package uses an organization-based model to manage access to multiple tenants from a central control plane.

> **Note**: For detailed information about the control plane architecture, entity synchronization, and API access methods, see the [Control Plane Architecture](./control-plane.md) guide.

## Organization-Tenant Relationship

The system uses organizations on the control plane to represent and control access to child tenants:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONTROL PLANE (main)                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Organization │  │ Organization │  │ Organization │           │
│  │   "acme"     │  │  "widgets"   │  │   "demo"     │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
└─────────┼─────────────────┼─────────────────┼────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │  TENANT  │      │  TENANT  │      │  TENANT  │
    │  "acme"  │      │ "widgets"│      │  "demo"  │
    │          │      │          │      │          │
    │ - Users  │      │ - Users  │      │ - Users  │
    │ - Apps   │      │ - Apps   │      │ - Apps   │
    │ - Config │      │ - Config │      │ - Config │
    └──────────┘      └──────────┘      └──────────┘
```

**Key concepts:**

1. **Control Plane**: The central management tenant that controls all other tenants
2. **Organizations**: Each organization on the control plane corresponds to a child tenant
3. **Child Tenants**: Independent tenants with their own users, applications, and configuration

## Token-Based Access Control

Access to tenants is controlled via the `org_name` or `organization_id` claim in JWT tokens:

| Token Type        | Org Claim      | Access                    |
| ----------------- | -------------- | ------------------------- |
| No organization   | `undefined`    | Control plane only        |
| With organization | `"acme"`       | Tenant matching org claim |

### Token Examples

**Token without organization** - can only access control plane:

```json
{
  "sub": "user_123",
  "aud": "https://api.example.com"
}
```

**Token with org_name** - can access the matching tenant:

```json
{
  "sub": "user_123",
  "aud": "https://api.example.com",
  "org_name": "acme"
}
```

**Token with organization_id** - also works (org.name is checked):

```json
{
  "sub": "user_123",
  "aud": "https://api.example.com",
  "organization_id": "org_abc123"
}
```

## Silent Authentication Flow

To switch between tenants, use **silent authentication** with a different organization:

```typescript
// 1. User is logged into control plane (no org)
const controlPlaneToken = await getToken();

// 2. To access "acme" tenant, request a new token with org_name
const acmeTenantToken = await auth.getTokenSilently({
  organization: "acme", // Request token for acme org
});

// 3. Use the new token to call acme tenant's API
const response = await fetch("https://acme.auth.example.com/api/users", {
  headers: {
    Authorization: `Bearer ${acmeTenantToken}`,
  },
});
```

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SILENT AUTHENTICATION FLOW                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. User logged into Control Plane                                 │
│     Token: { sub: "user_123" }                                      │
│                                                                      │
│  2. Request token for "acme" organization (silent auth)             │
│     └─> GET /authorize?organization=acme&prompt=none                │
│                                                                      │
│  3. Auth server validates:                                          │
│     - User is member of "acme" organization on control plane        │
│     - User has appropriate permissions                              │
│                                                                      │
│  4. Returns new token                                               │
│     Token: { sub: "user_123", org_name: "acme" }                    │
│                                                                      │
│  5. Use token to access "acme" tenant API                           │
│     └─> GET https://acme.auth.example.com/api/users                 │
│         Authorization: Bearer <acme_token>                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Client-Side Implementation

### React Example

```typescript
import { useAuth0 } from "@auth0/auth0-react";

function TenantSwitcher({ tenantId }: { tenantId: string }) {
  const { getAccessTokenSilently } = useAuth0();

  const switchToTenant = async () => {
    // Get a token for the target tenant's organization
    const token = await getAccessTokenSilently({
      authorizationParams: {
        organization: tenantId,
      },
    });

    // Store token for API calls to this tenant
    setTenantToken(tenantId, token);
  };

  return (
    <button onClick={switchToTenant}>
      Switch to {tenantId}
    </button>
  );
}
```

### Tenant Manager Component

```typescript
import { useAuth0 } from "@auth0/auth0-react";

function TenantManager() {
  const { getAccessTokenSilently } = useAuth0();
  const [tenants, setTenants] = useState([]);

  // Fetch tenants using control plane token (no org)
  const fetchTenants = async () => {
    const token = await getAccessTokenSilently();
    const response = await fetch("/management/tenants", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setTenants(await response.json());
  };

  // Switch to a tenant using silent auth
  const switchToTenant = async (tenantId: string) => {
    const token = await getAccessTokenSilently({
      authorizationParams: {
        organization: tenantId,
      },
    });

    // Store token and redirect to tenant admin
    sessionStorage.setItem(`tenant_token_${tenantId}`, token);
    window.location.href = `/${tenantId}/admin`;
  };

  return (
    <div>
      <h1>Tenants</h1>
      {tenants.map(tenant => (
        <div key={tenant.id}>
          <span>{tenant.name}</span>
          <button onClick={() => switchToTenant(tenant.id)}>
            Manage
          </button>
        </div>
      ))}
    </div>
  );
}
```

## Security Considerations

### Organization Membership

- Users must be members of an organization on the control plane to access the corresponding child tenant
- Membership is validated during token issuance
- Removing a user from an organization immediately revokes their access to the tenant

### Permission Scoping

- Permissions granted to organizations determine what actions users can perform in the tenant
- Default permissions can be configured when creating tenants
- Additional permissions can be granted on a per-organization basis

### Token Validation

- Tokens are validated on every request
- The `org_name` or `organization_id` claim must match the requested tenant
- Tokens without org claim can only access the control plane

## Next Steps

- [Control Plane Architecture](./control-plane.md) - Deep dive into control plane, entity sync, and API access
- [Database Isolation](./database-isolation.md) - Learn about per-tenant databases
- [Tenant Lifecycle](./tenant-lifecycle.md) - Managing tenant creation and deletion
- [API Reference](./api-reference.md) - Complete API documentation
