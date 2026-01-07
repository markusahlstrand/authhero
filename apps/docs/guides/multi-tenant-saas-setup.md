---
title: Multi-Tenant SaaS Authentication Setup
description: Learn how to build a complete multi-tenant SaaS authentication solution with a central portal and customer-specific domains using AuthHero's organization-based architecture.
---

# Multi-Tenant SaaS Authentication Setup

This guide shows you how to build a multi-tenant SaaS authentication solution where you have a central portal for managing customer tenants, while each customer has their own authentication domain with first-party cookies.

## Problem Statement

When building a SaaS service, you often need to provide authentication as part of your solution. This typically involves:

- **Central Portal**: A common portal where all your customers can manage their end-users
- **Portal Authentication**: The portal uses authentication tied to your top-level domain for convenience
- **Customer Domains**: Each customer wants authentication tied to their own domain using first-party cookies
- **Complete Isolation**: Each customer should have their own tenant with no connection between tenants

This is a fairly common scenario when building SaaS services, and it was one of the key reasons AuthHero was created.

## The Challenge with Traditional Solutions

While this setup is theoretically possible with Auth0, it presents significant challenges:

- No easy way to connect an organization in one tenant to another tenant
- No straightforward way to grant users access to manage the portal and specific customer tenants
- Complex custom implementation required with significant development effort

## The AuthHero Solution

AuthHero provides this functionality **out of the box** using an organization-based architecture.

## Quick Start with create-authhero

The easiest way to get started is using the [`create-authhero`](https://www.npmjs.com/package/create-authhero) scaffolding tool, which includes a **multi-tenant control-plane** option:

::: code-group

```bash [npm]
npm create authhero@latest my-saas-auth
```

```bash [pnpm]
pnpm create authhero my-saas-auth
```

```bash [yarn]
yarn create authhero my-saas-auth
```

:::

When prompted, select the **multi-tenant control-plane** option. This will set up:

- ✅ A control-plane tenant for your portal
- ✅ Self-serve customer sign-up flow
- ✅ Automatic organization creation when customers sign up
- ✅ Automatic tenant creation linked to the organization
- ✅ Organization token handling with proper cache isolation
- ✅ Pre-configured roles and permissions

**Self-Serve Customer Onboarding**: When a customer signs up through the self-serve flow, the system automatically:

1. Creates an organization in the control-plane tenant
2. Creates a dedicated tenant for that customer
3. Links the organization to the customer tenant
4. Adds the signing-up user as an admin of their organization

This means you don't need to manually create organizations and tenants - it's all handled automatically!

### Architecture Overview

````
┌─────────────────────────────────────────────────────┐
│  Manual Setup (If Not Using create-authhero)

If you're adding multi-tenant capabilities to an existing AuthHero setup or want to understand how it works under the hood, follow these steps:

### Step 1: Create the Portal Tenant

First, create a tenant that will serve as your central portal:

```typescript
// In your AuthHero configuration
const portalTenantId = "portal"; // Your main tenant ID
````

### Step 2: Set Up Organizations for Customers

::: tip
If you used `create-authhero` with the multi-tenant option, this is handled automatically via the self-serve sign-up flow. You only need to implement this manually if you're building custom onboarding.
::: │
└─────────────────────────────────────────────────────┘
│ │
│ Organization Token │ Organization Token
│ (scoped access) │ (scoped access)
▼ ▼
┌─────────────────┐ ┌─────────────────┐
│ Customer A │ │ Customer B │
│ Tenant │ │ Tenant │
│ (Different │ │ (Different │
│ issuer, │ │ issuer, │
│ keys, etc.) │ │ keys, etc.) │
└─────────────────┘ └─────────────────┘

````

### How It Works

1. **Control-Plane Tenant**: You have one control-plane tenant that handles all users logging into your platform
2. **Automatic Organization Creation**: When a customer tenant is created, the multi-tenancy plugin automatically creates a corresponding organization in the control-plane
3. **Organization Members**: Customer users are automatically added as members of their organization during sign-up
4. **Role-Based Access**: Define roles on the control-plane tenant (e.g., admin, viewer) that are assigned to users within organizations
5. **Organization Selection**: Users see a list of organizations they're members of at the portal root
6. **Organization Tokens**: When a user selects a customer organization, they request an organization token using silent authentication
7. **Scoped Access**: The organization token is scoped to that specific organization with the user's specific permissions
8. **Tenant Management**: Users can manage their customer tenant using the organization token, which uses completely different keys, issuer, and other settings

## Understanding the Architecture

::: tip Automatic Setup with create-authhero
If you used `create-authhero` with the multi-tenant control-plane option, most of this is already set up for you. Organizations are automatically created via the multi-tenancy plugin when customer tenants are created.
:::

### The Control-Plane Tenant

The control-plane is a special tenant that:
- Handles authentication for your portal/admin interface
- Contains organizations that map to customer tenants
- Stores roles and permissions for portal users
- Issues tokens for both portal access and organization-scoped customer access

```typescript
// Example: Control-plane configuration in create-authhero
const CONTROL_PLANE_TENANT_ID = "control-plane";
````

### Automatic Organization & Tenant Linking

The multi-tenancy plugin listens to tenant creation events and automatically:

1. Creates an organization in the control-plane when a customer tenant is created
2. Links the organization to the customer tenant (stored in organization metadata)
3. Adds the signing-up user as an admin of the organization

This happens automatically through hooks - **you don't need to manually create organizations**.

### Resource Server and Role Synchronization

One of the most powerful features of the multi-tenant control-plane setup is **automatic synchronization** of resource servers and roles:

**How It Works:**

- Resource servers (APIs) and roles defined in the control-plane are automatically synced to all customer tenants
- When you create or update a resource server or role in the control-plane, it's propagated to all customer tenants
- This allows you to **manage all customers from a single place** instead of configuring each tenant individually

**Example Use Case:**

```typescript
// Define a resource server in the control-plane
const customerAPI = await managementClient.resourceServers.create({
  name: "Customer Portal API",
  identifier: "https://api.yourplatform.com",
  scopes: [
    { value: "read:profile", description: "Read user profile" },
    { value: "write:profile", description: "Update user profile" },
    { value: "manage:team", description: "Manage team members" },
  ],
});

// This resource server is automatically synced to ALL customer tenants!
// Each customer's users can now request tokens for this API
```

**Role Synchronization:**

```typescript
// Define roles in the control-plane
const adminRole = await managementClient.roles.create({
  name: "admin",
  description: "Full administrative access",
});

const userRole = await managementClient.roles.create({
  name: "user",
  description: "Standard user access",
});

// These roles are automatically available in all customer tenants
// Customer admins can assign these roles to their users
```

**Benefits:**

- ✅ Single source of truth for APIs and permissions across all customers
- ✅ Consistent permission model across all customer tenants
- ✅ Easy updates - change once in control-plane, applies everywhere
- ✅ No need to manually configure each customer tenant

**Excluding Internal Resources:**
As mentioned in the [Advanced Topics](#preventing-resource-server-sync) section, you can exclude internal-only resources from syncing using metadata flags or naming conventions.

### Managing Organization Members

::: tip
With `create-authhero`, the first user is automatically added to their organization during self-serve sign-up.
:::

To add additional users to an organization (e.g., inviting team members):

```typescript
// Add user to the organization
await managementClient.organizations.addMembers(organizationId, {
  members: ["user_id_123"],
});

// Assign roles to the user
await managementClient.organizations.addMemberRoles(
  organizationId,
  "user_id_123",
  {
    roles: ["rol_admin"], // or "rol_viewer"
  },
);
```

### Configuring Roles

::: tip
With `create-authhero`, basic roles are pre-configured in the control-plane tenant.
:::

Define roles in your control-plane tenant that control what users can do:

```typescript
// Create roles on the control-plane tenant
const adminRole = await managementClient.roles.create({
  name: "admin",
  description: "Full administrative access to customer tenant",
});

const viewerRole = await managementClient.roles.create({
  name: "viewer",
  description: "Read-only access to customer tenant",
});
```

### Implementing Organization Selection UI

In your portal, display organizations the user is a member of using the `/tenants` endpoint:

::: info AuthHero Extension
The `/tenants` endpoint is an **AuthHero extension** not available in Auth0. It provides powerful multi-tenant capabilities:

- List all organizations a user is a member of
- Enable self-serve tenant creation
- Allow users to create their own customer tenants directly from your portal
  :::

```typescript
// Get user's organizations from the control-plane using the /tenants endpoint
const token = await auth0Client.getTokenSilently();

const response = await fetch("https://auth.yourplatform.com/api/v2/tenants", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const organizations = await response.json();

// Display list for user to select
organizations.forEach((org) => {
  console.log(org.id, org.display_name);
});
```

**Self-Serve Tenant Creation:**

The `/tenants` endpoint also allows users to create their own tenants (customer organizations) through your portal:

```typescript
// Allow users to create a new customer tenant
async function createTenant(tenantName: string, displayName: string) {
  const token = await auth0Client.getTokenSilently();

  const response = await fetch("https://auth.yourplatform.com/api/v2/tenants", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: tenantName,
      display_name: displayName,
    }),
  });

  const newTenant = await response.json();

  // The multi-tenancy plugin will automatically:
  // 1. Create the tenant
  // 2. Create an organization in the control-plane
  // 3. Link the organization to the tenant
  // 4. Add the user as an admin of the organization

  return newTenant;
}
```

This makes it easy to build a completely self-serve multi-tenant platform where customers can sign up and start using your service immediately without any manual intervention.

### Getting Organization-Scoped Tokens

::: tip
If you used `create-authhero` with the multi-tenant option, the `OrgCache` implementation and organization token handling is already included in the generated code.
:::

This is the critical piece. When a user selects an organization, you need to get an organization-scoped token. This requires understanding how token refresh and silent authentication work, and implementing a custom cache to avoid conflicts.

#### Understanding Refresh Tokens vs Silent Authentication

**Important distinction:**

- **Refresh Tokens**: When you use a refresh token to get a new access token, you **cannot change the organization or scopes**. The new token will have the same parameters as the original authorization.

- **Silent Authentication**: When you use `getTokenSilently()`, it can re-authenticate with **different parameters** (like a different organization). This is essential for switching between customer organizations.

When switching organizations, you need to perform silent authentication with the new organization parameter, not just refresh the existing token.

#### The Cache Clash Problem

The auth0-spa-js library has a cache clash issue when switching between organizations:

1. User authenticates to Organization A, cache stores the token
2. User tries to switch to Organization B with `getTokenSilently({ organization: 'org_b' })`
3. The library finds the cached token from Organization A and returns it
4. User gets the wrong token for the wrong organization! ❌

This happens because the default cache doesn't distinguish between tokens for different organizations.

#### The Solution: Organization-Isolated Cache

Create a custom cache that isolates tokens by organization:

```typescript
import { ICache, Cacheable, MaybePromise } from "@auth0/auth0-spa-js";

const CACHE_KEY_PREFIX = "@@auth0spajs@@";

/**
 * Custom cache provider that wraps localStorage and adds organization isolation.
 * This ensures that tokens and auth state are kept separate between organizations.
 */
export class OrgCache implements ICache {
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  public set<T = Cacheable>(key: string, entry: T) {
    const orgKey = `${key}:${this.orgId}`;
    localStorage.setItem(orgKey, JSON.stringify(entry));
  }

  public get<T = Cacheable>(key: string): MaybePromise<T | undefined> {
    const orgKey = `${key}:${this.orgId}`;
    const json = window.localStorage.getItem(orgKey);

    if (!json) return;

    try {
      const payload = JSON.parse(json) as T;
      return payload;
    } catch (e) {
      return;
    }
  }

  public remove(key: string) {
    const orgKey = `${key}:${this.orgId}`;
    localStorage.removeItem(orgKey);
  }

  public allKeys() {
    const orgSuffix = `:${this.orgId}`;
    return Object.keys(window.localStorage).filter(
      (key) => key.startsWith(CACHE_KEY_PREFIX) && key.endsWith(orgSuffix),
    );
  }
}
```

#### Create Organization-Specific Auth0 Client

```typescript
import { Auth0Client } from "@auth0/auth0-spa-js";

// Create an Auth0 client with organization-specific cache
function createOrganizationClient(domain: string, organizationId: string) {
  return new Auth0Client({
    domain: domain,
    clientId: "your-client-id",
    authorizationParams: {
      organization: organizationId,
      audience: "urn:authhero:management",
    },
    cache: new OrgCache(organizationId),
    cacheLocation: "localstorage",
  });
}
```

#### Get Organization Token

```typescript
// When user selects an organization
async function getOrganizationToken(organizationId: string): Promise<string> {
  const orgClient = createOrganizationClient(
    "auth.yourplatform.com",
    organizationId,
  );

  try {
    // Use silent authentication to get organization-scoped token
    const token = await orgClient.getTokenSilently({
      authorizationParams: {
        organization: organizationId,
      },
    });

    return token;
  } catch (error) {
    // If silent auth fails, redirect to login with organization context
    await orgClient.loginWithRedirect({
      authorizationParams: {
        organization: organizationId,
      },
    });
    throw error;
  }
}
```

### Step 7: Use Organization Token for Customer Tenant Management

Once you have the organization token, use it to manage the customer's tenant:

```typescript
// The organization token can now be used to access the customer's tenant
const response = await fetch(
  `https://api.yourplatform.com/customers/${organizationId}/users`,
  {
    headers: {
      Authorization: `Bearer ${organizationToken}`,
    },
  },
);
```

The key here is that the organization token:

- Has a different issuer
- Uses different signing keys
- Is scoped to the specific organization
- Contains the organization ID in the `org_id` claim
- Has the user's roles and permissions for that organization

### Step 8: Clear Organization Cache on Logout

When a user logs out, make sure to clear all organization-specific cached tokens:

```typescript
export function clearOrganizationTokenCache(): void {
  const keysToRemove = Object.keys(window.localStorage).filter(
    (key) => key.startsWith(CACHE_KEY_PREFIX) && key.match(/:[^:]+$/),
  );
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
```

## Complete Example: Portal with Organization Management

Here's a complete example of a React component that implements organization selection and token management:

```tsx
import React, { useState, useEffect } from "react";
import { Auth0Client } from "@auth0/auth0-spa-js";
import { OrgCache } from "./utils/orgCache";

interface Organization {
  id: string;
  name: string;
  display_name: string;
}

export function OrganizationSelector() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [orgToken, setOrgToken] = useState<string | null>(null);

  // Main auth client (no organization)
  const auth0Client = new Auth0Client({
    domain: "auth.yourplatform.com",
    clientId: "your-client-id",
    authorizationParams: {
      audience: "urn:authhero:management",
    },
  });

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    // Get user's organizations from the main tenant
    const token = await auth0Client.getTokenSilently();

    const response = await fetch(
      "https://api.yourplatform.com/user/organizations",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const orgs = await response.json();
    setOrganizations(orgs);
  }

  async function selectOrganization(orgId: string) {
    // Create organization-specific client with custom cache
    const orgClient = new Auth0Client({
      domain: "auth.yourplatform.com",
      clientId: "your-client-id",
      authorizationParams: {
        organization: orgId,
        audience: "urn:authhero:management",
      },
      cache: new OrgCache(orgId),
      cacheLocation: "localstorage",
    });

    try {
      // Get organization-scoped token using silent authentication
      const token = await orgClient.getTokenSilently({
        authorizationParams: {
          organization: orgId,
        },
      });

      setSelectedOrg(orgId);
      setOrgToken(token);
    } catch (error) {
      console.error("Failed to get organization token", error);
      // Redirect to login with organization context if needed
      await orgClient.loginWithRedirect({
        authorizationParams: {
          organization: orgId,
        },
      });
    }
  }

  return (
    <div>
      <h2>Select Customer</h2>
      <ul>
        {organizations.map((org) => (
          <li key={org.id}>
            <button onClick={() => selectOrganization(org.id)}>
              {org.display_name}
            </button>
          </li>
        ))}
      </ul>

      {selectedOrg && (
        <div>
          <h3>Managing: {selectedOrg}</h3>
          <CustomerManagement token={orgToken!} orgId={selectedOrg} />
        </div>
      )}
    </div>
  );
}

interface CustomerManagementProps {
  token: string;
  orgId: string;
}

function CustomerManagement({ token, orgId }: CustomerManagementProps) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    loadUsers();
  }, [token, orgId]);

  async function loadUsers() {
    const response = await fetch(
      `https://api.yourplatform.com/customers/${orgId}/users`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const data = await response.json();
    setUsers(data);
  }

  return (
    <div>
      <h4>Users</h4>
      {/* Render users and management UI */}
    </div>
  );
}
```

## Backend Implementation

On your backend, you'll need to validate the organization token and enforce authorization:

```typescript
import { Hono } from "hono";
import { createAuthHero } from "authhero";

const app = new Hono();

const auth = createAuthHero({
  database: adapter,
});

// Middleware to verify organization token
app.use("/customers/:orgId/*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Verify the token and extract claims
  const claims = await auth.verifyToken(token);

  // Check that the org_id in the token matches the requested organization
  const requestedOrgId = c.req.param("orgId");
  if (claims.org_id !== requestedOrgId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Check user permissions (roles)
  if (!claims.permissions?.includes("read:users")) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  c.set("user", claims);
  await next();
});

// Example endpoint to list users in customer tenant
app.get("/customers/:orgId/users", async (c) => {
  const orgId = c.req.param("orgId");

  // Query users in the customer's tenant
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.tenant_id, orgId));

  return c.json(users);
});

export default app;
```

## Key Benefits of This Approach

1. **Zero Configuration**: This is entirely out of the box with AuthHero - no complex custom implementation needed

2. **Complete Isolation**: Each customer tenant has:
   - Different issuer
   - Different signing keys
   - Isolated data
   - Independent configuration

3. **Granular Access Control**: Use organizations and roles to control:
   - Who can access which customer tenants
   - What permissions they have (admin, viewer, etc.)
   - Multiple users per organization

4. **First-Party Cookies**: Each customer can use their own domain with first-party cookies for their end-users

5. **Scalable**: Add new customers and users without changing your architecture

6. **Familiar Auth Pattern**: Uses standard OAuth 2.0 flows that developers already understand

## Migration from Auth0

If you're currently using Auth0 with a similar setup, migration is straightforward:

1. Export your organizations from Auth0
2. Create corresponding organizations in AuthHero
3. Update your organization token fetching code to use the `OrgCache` implementation
4. Point your application to AuthHero endpoints
5. Test the organization selection and token flow

The rest of your application logic can remain largely unchanged since AuthHero is Auth0-compatible.

## Troubleshooting

### Organization Token Not Working

If you're getting unauthorized errors with organization tokens:

1. Verify the `org_id` claim is in the token (decode it at jwt.io)
2. Check that the organization exists in your portal tenant
3. Ensure the user is a member of the organization
4. Verify the user has the required roles

### Silent Authentication Failing

If `getTokenSilently()` fails:

1. The user may not have an active session - redirect to login
2. Check that the organization ID is correct
3. Verify the cache is properly isolating tokens by organization

### Cache Conflicts

If you're seeing token conflicts between organizations:

1. Ensure you're using the `OrgCache` implementation
2. Verify each organization gets its own Auth0Client instance
3. Clear the cache when switching organizations if needed

## Advanced Topics

### Internal Permissions and Cross-Tenant Access

When building a SaaS platform, you'll often need internal services and support staff to access multiple or all customer tenants. There are several architectural patterns to handle this:

#### Pattern 1: Control Plane Resource Servers (Recommended)

Keep internal and cross-tenant permissions **only** on the control plane (portal tenant). Don't sync these to customer tenants.

**Use cases:**

- Internal admin tools that need access to all customers
- Support staff accessing multiple customer tenants
- Internal services (analytics, monitoring, billing) that read data across tenants
- Platform-level APIs

**Implementation:**

```typescript
// Create a resource server on the control plane for internal tools
const internalAPI = await managementClient.resourceServers.create({
  name: "Internal Platform API",
  identifier: "https://internal.yourplatform.com",
  scopes: [
    {
      value: "read:all-tenants",
      description: "Read access to all customer data",
    },
    {
      value: "write:all-tenants",
      description: "Write access to all customer data",
    },
    { value: "manage:billing", description: "Manage customer billing" },
    { value: "support:access", description: "Support staff access" },
  ],
  // Mark as non-syncable (see "Preventing Resource Sync" below)
  metadata: {
    sync: false,
    internal: true,
  },
});

// Create roles for internal staff
const supportRole = await managementClient.roles.create({
  name: "support-engineer",
  description: "Support engineer with multi-tenant access",
});

// Grant the role access to internal API
await managementClient.roles.addPermissions(supportRole.id, {
  permissions: [
    {
      resource_server_identifier: "https://internal.yourplatform.com",
      permission_name: "support:access",
    },
  ],
});
```

**Accessing customer data with internal permissions:**

When an internal service or support user needs to access customer data:

1. They authenticate to the control plane (no organization)
2. Get a token with internal permissions
3. Use that token to access your platform APIs
4. Your platform APIs validate the internal permissions and access customer data directly

```typescript
// Internal service or support authentication
const internalToken = await auth0Client.getTokenSilently({
  authorizationParams: {
    audience: "https://internal.yourplatform.com",
    scope: "support:access read:all-tenants",
  },
});

// Use this token to access platform APIs
const response = await fetch(
  "https://api.yourplatform.com/internal/customers/customer-123/users",
  {
    headers: {
      Authorization: `Bearer ${internalToken}`,
    },
  },
);
```

**Backend validation for internal access:**

```typescript
app.get("/internal/customers/:customerId/users", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  const claims = await auth.verifyToken(token);

  // Verify this is an internal token (no org_id)
  if (claims.org_id) {
    return c.json({ error: "This endpoint requires internal access" }, 403);
  }

  // Check for internal permissions
  if (!claims.permissions?.includes("support:access")) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Access allowed - query customer data directly
  const customerId = c.req.param("customerId");
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.tenant_id, customerId));

  return c.json(users);
});
```

#### Pattern 2: Multi-Organization Access

For scenarios where internal users need to impersonate or act within specific customer contexts, use organization memberships:

```typescript
// Add a support engineer to multiple customer organizations
const supportUser = await managementClient.users.create({
  email: "support@yourplatform.com",
  connection: "Username-Password-Authentication",
});

// Add them to multiple customer organizations
await managementClient.organizations.addMembers("org_customer_a", {
  members: [supportUser.user_id],
});

await managementClient.organizations.addMemberRoles(
  "org_customer_a",
  supportUser.user_id,
  {
    roles: ["rol_admin"], // Or a special support role
  },
);

// Repeat for other customers
await managementClient.organizations.addMembers("org_customer_b", {
  members: [supportUser.user_id],
});
```

Now the support user can:

1. See all their organizations in the portal
2. Select which customer to access
3. Get an organization token for that customer
4. Access customer-specific resources with full context

### Preventing Resource Server Sync

If you're building a system that syncs resource servers from the control plane to customer tenants, you'll want to exclude internal resources. Here are two approaches:

#### Approach 1: Metadata Flag (Recommended)

Use a metadata property to mark resources as non-syncable:

```typescript
// When creating resource servers
const resourceServer = await managementClient.resourceServers.create({
  name: "My API",
  identifier: "https://api.example.com",
  metadata: {
    sync: false, // Don't sync this to customer tenants
    internal: true,
  },
});

// In your sync logic
async function syncResourceServers(targetTenantId: string) {
  const resourceServers = await managementClient.resourceServers.getAll();

  for (const rs of resourceServers) {
    // Skip resources marked as non-syncable
    if (rs.metadata?.sync === false || rs.metadata?.internal === true) {
      continue;
    }

    // Sync to customer tenant
    await syncToTenant(targetTenantId, rs);
  }
}
```

#### Approach 2: Naming Convention

Use a consistent prefix for internal resources:

```typescript
// Internal resources
const internalAPI = await managementClient.resourceServers.create({
  name: "Internal: Platform API",
  identifier: "https://internal.yourplatform.com", // Starts with 'internal.'
});

const supportTools = await managementClient.resourceServers.create({
  name: "Internal: Support Tools",
  identifier: "https://internal-support.yourplatform.com",
});

// Customer-facing resources (these get synced)
const customerAPI = await managementClient.resourceServers.create({
  name: "Customer API",
  identifier: "https://api.yourplatform.com",
});

// In your sync logic
async function syncResourceServers(targetTenantId: string) {
  const resourceServers = await managementClient.resourceServers.getAll();

  for (const rs of resourceServers) {
    // Skip resources with 'internal' in the identifier
    if (rs.identifier.includes("internal")) {
      continue;
    }

    // Or check the name prefix
    if (rs.name.startsWith("Internal:")) {
      continue;
    }

    await syncToTenant(targetTenantId, rs);
  }
}
```

#### Approach 3: Hybrid (Belt and Suspenders)

Combine both approaches for maximum clarity:

```typescript
const INTERNAL_PREFIX = "internal:";

// Helper to create internal resource
async function createInternalResource(config) {
  return managementClient.resourceServers.create({
    ...config,
    identifier: config.identifier.startsWith(INTERNAL_PREFIX)
      ? config.identifier
      : `${INTERNAL_PREFIX}${config.identifier}`,
    metadata: {
      ...(config.metadata || {}),
      sync: false,
      internal: true,
    },
  });
}

// Helper to check if resource is internal
function isInternalResource(resourceServer) {
  return (
    resourceServer.metadata?.internal === true ||
    resourceServer.metadata?.sync === false ||
    resourceServer.identifier.startsWith(INTERNAL_PREFIX) ||
    resourceServer.name.startsWith("Internal:")
  );
}

// Use in sync logic
async function syncResourceServers(targetTenantId: string) {
  const resourceServers = await managementClient.resourceServers.getAll();

  for (const rs of resourceServers) {
    if (isInternalResource(rs)) {
      console.log(`Skipping internal resource: ${rs.name}`);
      continue;
    }

    await syncToTenant(targetTenantId, rs);
  }
}
```

### Complete Example: Internal Support Access

Here's a complete example showing how support staff can access customer tenants:

```typescript
// 1. Create internal resource server
const internalAPI = await managementClient.resourceServers.create({
  name: "Internal: Platform API",
  identifier: "internal:platform-api",
  scopes: [
    { value: "support:read", description: "Read customer data for support" },
    { value: "support:write", description: "Modify customer data for support" },
  ],
  metadata: {
    sync: false,
    internal: true,
  },
});

// 2. Create support role on control plane
const supportRole = await managementClient.roles.create({
  name: "support-engineer",
  description: "Support engineer with cross-tenant access",
});

await managementClient.roles.addPermissions(supportRole.id, {
  permissions: [
    {
      resource_server_identifier: "internal:platform-api",
      permission_name: "support:read",
    },
    {
      resource_server_identifier: "internal:platform-api",
      permission_name: "support:write",
    },
  ],
});

// 3. Assign support role to users
const supportUser = await managementClient.users.create({
  email: "alice@yourcompany.com",
  connection: "Username-Password-Authentication",
});

await managementClient.users.assignRoles(supportUser.user_id, {
  roles: [supportRole.id],
});

// 4. Support engineer authenticates
const supportToken = await auth0Client.getTokenSilently({
  authorizationParams: {
    audience: "internal:platform-api",
    scope: "support:read support:write",
  },
});

// 5. Backend validates and provides access
app.get("/internal/customers/:customerId/users", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  const claims = await auth.verifyToken(token);

  // Must be an internal token
  if (claims.org_id) {
    return c.json({ error: "Requires internal access token" }, 403);
  }

  // Must have support permission
  if (!claims.permissions?.includes("support:read")) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Log the access for audit purposes
  await auditLog({
    action: "support_access",
    user: claims.sub,
    customer: c.req.param("customerId"),
    timestamp: new Date(),
  });

  // Access customer data
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.tenant_id, c.req.param("customerId")));

  return c.json(users);
});
```

### Decision Matrix

| Scenario                                  | Recommended Pattern           | Token Type                       |
| ----------------------------------------- | ----------------------------- | -------------------------------- |
| Internal admin tools                      | Control plane resource server | Internal token (no org_id)       |
| Support staff accessing specific customer | Multi-organization membership | Organization token (with org_id) |
| Cross-tenant analytics service            | Control plane resource server | Internal token (no org_id)       |
| Customer managing their own users         | Organization membership       | Organization token (with org_id) |
| Platform billing service                  | Control plane resource server | Internal token (no org_id)       |
| Support needs customer context            | Multi-organization membership | Organization token (with org_id) |

### Best Practices

1. **Separation of Concerns**: Keep internal resources on the control plane, customer resources on customer tenants
2. **Explicit Marking**: Always mark internal resources with both metadata and naming conventions
3. **Audit Logging**: Log all internal/support access to customer data
4. **Principle of Least Privilege**: Give internal services only the permissions they need
5. **Token Type Validation**: Always check whether a token has `org_id` to determine if it's internal or customer-scoped
6. **Documentation**: Document which resources are internal vs. customer-facing in your team's runbooks

## Next Steps

- [Custom Domain Setup](./custom-domain-setup.md) - Configure custom domains for your customer tenants
- [RBAC and Scopes](./rbac-and-scopes.md) - Learn more about role-based access control
- [Hooks](./hooks.md) - Customize authentication flows with hooks

## Conclusion

AuthHero makes it easy to build sophisticated multi-tenant SaaS authentication solutions that would require significant custom development in other platforms. The organization-based architecture provides clean separation between your portal and customer tenants while maintaining a seamless user experience.

**Getting Started:**

- Use `create-authhero` with the multi-tenant control-plane option for automatic setup
- Self-serve customer sign-up automatically creates organizations and linked tenants
- The only custom code needed is the `OrgCache` implementation for proper token isolation (included in the scaffolded project)

Everything else - organization management, tenant isolation, role-based access - works out of the box.
