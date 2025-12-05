# Architecture

The multi-tenancy package uses an organization-based model to manage access to multiple tenants from a single main tenant.

## Organization-Tenant Relationship

The system uses organizations on a "main" tenant to represent and control access to child tenants:

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN TENANT                               │
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

1. **Main Tenant**: The management tenant that controls all other tenants
2. **Organizations**: Each organization on the main tenant corresponds to a child tenant
3. **Child Tenants**: Independent tenants with their own users, applications, and configuration

## Token-Based Access Control

Access to tenants is controlled via the `org_id` claim in JWT tokens:

| Token Type        | `org_id` Claim | Access                 |
| ----------------- | -------------- | ---------------------- |
| No organization   | `undefined`    | Main tenant only       |
| With organization | `"acme"`       | Tenant matching org_id |

### Token Examples

**Token without org_id** - can only access main tenant:

```json
{
  "sub": "user_123",
  "aud": "https://api.example.com"
}
```

**Token with org_id** - can access the matching tenant:

```json
{
  "sub": "user_123",
  "aud": "https://api.example.com",
  "org_id": "acme"
}
```

## Silent Authentication Flow

To switch between tenants, use **silent authentication** with a different organization:

```typescript
// 1. User is logged into main tenant (no org)
const mainTenantToken = await getToken();

// 2. To access "acme" tenant, request a new token with org_id
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
│  1. User logged into Main Tenant                                    │
│     Token: { sub: "user_123" }                                      │
│                                                                      │
│  2. Request token for "acme" organization (silent auth)             │
│     └─> GET /authorize?organization=acme&prompt=none                │
│                                                                      │
│  3. Auth server validates:                                          │
│     - User is member of "acme" organization on main tenant          │
│     - User has appropriate permissions                              │
│                                                                      │
│  4. Returns new token                                               │
│     Token: { sub: "user_123", org_id: "acme" }                      │
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

  // Fetch tenants using main tenant token (no org)
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

- Users must be members of an organization on the main tenant to access the corresponding child tenant
- Membership is validated during token issuance
- Removing a user from an organization immediately revokes their access to the tenant

### Permission Scoping

- Permissions granted to organizations determine what actions users can perform in the tenant
- Default permissions can be configured when creating tenants
- Additional permissions can be granted on a per-organization basis

### Token Validation

- Tokens are validated on every request
- The `org_id` claim must match the requested tenant
- Tokens without `org_id` can only access the main tenant

## Next Steps

- [Database Isolation](./database-isolation.md) - Learn about per-tenant databases
- [Tenant Lifecycle](./tenant-lifecycle.md) - Managing tenant creation and deletion
- [API Reference](./api-reference.md) - Complete API documentation
