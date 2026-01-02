# Custom Authorization Middleware

This guide shows how to design and implement custom authorization middleware for AuthHero that enforces role-based access control (RBAC) with tenant-level isolation and handles complex permission hierarchies across multiple applications.

## Overview

AuthHero provides built-in authentication middleware, but you may need custom authorization logic for:

- **Complex permission hierarchies** - Nested roles, inherited permissions, organizational hierarchies
- **Dynamic access control** - Context-dependent permissions (time-based, location-based, resource-based)
- **Multi-application RBAC** - Unified permission model across multiple APIs
- **Tenant-level isolation** - Strict data isolation with tenant-specific permissions
- **Custom audit logging** - Track authorization decisions for compliance

## Architecture

### Core Components

```typescript
┌─────────────────────────────────────────────────────────────┐
│                     Request Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│  1. Authentication Middleware (Built-in)                    │
│     └─> Verifies JWT, extracts user & tenant               │
│                                                             │
│  2. Authorization Middleware (Custom)                       │
│     ├─> Load user roles & permissions                      │
│     ├─> Check permission hierarchies                       │
│     ├─> Evaluate custom policies                           │
│     └─> Enforce tenant isolation                           │
│                                                             │
│  3. Route Handler                                           │
│     └─> Business logic                                     │
└─────────────────────────────────────────────────────────────┘
```

### Permission Model

```typescript
// Permission hierarchy example
interface Permission {
  name: string;                    // e.g., "users:read"
  resource: string;                // e.g., "users"
  action: string;                  // e.g., "read", "write", "delete"
  scope?: "tenant" | "org" | "global";
  conditions?: PolicyCondition[];   // Dynamic conditions
}

interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  inheritsFrom?: string[];         // Role inheritance
  priority: number;                // For conflict resolution
}

interface PolicyCondition {
  type: "time" | "location" | "resource_owner" | "custom";
  rule: string;
  params?: Record<string, unknown>;
}
```

## Implementation

### 1. Basic Authorization Middleware

Create a middleware that enforces RBAC with tenant isolation:

```typescript
// src/middleware/authorization.ts
import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../types";

interface AuthorizationConfig {
  // Permission cache TTL in seconds
  cacheTTL?: number;
  
  // Custom permission evaluator
  evaluatePermission?: (
    ctx: Context,
    required: string[],
    user: UserPermissions,
  ) => Promise<boolean>;
  
  // Audit logger
  auditLog?: (
    ctx: Context,
    decision: "allow" | "deny",
    required: string[],
  ) => Promise<void>;
}

interface UserPermissions {
  userId: string;
  tenantId: string;
  roles: Role[];
  directPermissions: string[];
  organizationId?: string;
}

export function createAuthorizationMiddleware(
  config: AuthorizationConfig = {},
) {
  return async (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    next: Next,
  ) => {
    // Get user from authentication middleware
    const userId = ctx.var.user_id;
    const tenantId = ctx.var.tenant_id;
    
    if (!userId) {
      // No authentication required for this route
      return await next();
    }

    if (!tenantId) {
      throw new HTTPException(400, { 
        message: "Tenant ID is required for authorization" 
      });
    }

    // Load user permissions
    const userPermissions = await loadUserPermissions(
      ctx,
      tenantId,
      userId,
    );

    // Get required permissions from route metadata
    const requiredPermissions = getRequiredPermissions(ctx);

    if (requiredPermissions.length === 0) {
      // No specific permissions required
      return await next();
    }

    // Check if user has required permissions
    const hasPermission = await checkPermissions(
      ctx,
      userPermissions,
      requiredPermissions,
      config,
    );

    // Audit logging
    if (config.auditLog) {
      await config.auditLog(
        ctx,
        hasPermission ? "allow" : "deny",
        requiredPermissions,
      );
    }

    if (!hasPermission) {
      throw new HTTPException(403, {
        message: "Insufficient permissions",
        cause: {
          required: requiredPermissions,
          user: userId,
          tenant: tenantId,
        },
      });
    }

    // Store user permissions in context for downstream use
    ctx.set("user_permissions", userPermissions);

    return await next();
  };
}
```

### 2. Permission Loading with Caching

Efficiently load and cache user permissions:

```typescript
// src/middleware/authorization/permissions.ts
import { Context } from "hono";
import { Bindings, Variables } from "../../types";

const permissionCache = new Map<string, {
  data: UserPermissions;
  expires: number;
}>();

export async function loadUserPermissions(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  userId: string,
): Promise<UserPermissions> {
  const cacheKey = `${tenantId}:${userId}`;
  const cached = permissionCache.get(cacheKey);

  // Check cache
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const { data } = ctx.env;

  // Load user roles
  const userRoles = await data.userRoles.list(tenantId, userId);
  
  // Load role details with permissions
  const roles = await Promise.all(
    userRoles.map(async (ur) => {
      const role = await data.roles.get(tenantId, ur.role_id);
      if (!role) return null;

      // Load role permissions
      const rolePermissions = await data.rolePermissions.list(
        tenantId,
        role.id,
      );

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: rolePermissions.map((rp) => rp.permission_name),
      };
    }),
  );

  // Load direct user permissions
  const directPermissions = await data.userPermissions.list(
    tenantId,
    userId,
  );

  const userPermissions: UserPermissions = {
    userId,
    tenantId,
    roles: roles.filter((r) => r !== null) as Role[],
    directPermissions: directPermissions.map((p) => p.permission_name),
    organizationId: ctx.var.organization_id,
  };

  // Cache for 5 minutes
  permissionCache.set(cacheKey, {
    data: userPermissions,
    expires: Date.now() + 5 * 60 * 1000,
  });

  return userPermissions;
}

// Clear cache when permissions change
export function clearUserPermissionCache(
  tenantId: string,
  userId: string,
): void {
  const cacheKey = `${tenantId}:${userId}`;
  permissionCache.delete(cacheKey);
}

// Clear all tenant permissions (when roles are modified)
export function clearTenantPermissionCache(tenantId: string): void {
  for (const key of permissionCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      permissionCache.delete(key);
    }
  }
}
```

### 3. Permission Hierarchy Evaluation

Implement role inheritance and permission hierarchies:

```typescript
// src/middleware/authorization/hierarchy.ts

interface RoleHierarchy {
  [roleId: string]: {
    inheritsFrom: string[];
    permissions: Set<string>;
  };
}

export class PermissionEvaluator {
  private hierarchy: RoleHierarchy = {};

  constructor(private ctx: Context<{ Bindings: Bindings; Variables: Variables }>) {}

  /**
   * Build role hierarchy from database
   */
  async buildHierarchy(tenantId: string): Promise<void> {
    const { data } = this.ctx.env;
    const { roles } = await data.roles.list(tenantId, {});

    for (const role of roles) {
      const permissions = await data.rolePermissions.list(tenantId, role.id);
      
      this.hierarchy[role.id] = {
        inheritsFrom: [], // Extended in your schema if you support role inheritance
        permissions: new Set(permissions.map((p) => p.permission_name)),
      };
    }
  }

  /**
   * Get all permissions for a user (including inherited)
   */
  getAllPermissions(userPermissions: UserPermissions): Set<string> {
    const allPermissions = new Set<string>();

    // Add direct permissions
    userPermissions.directPermissions.forEach((p) => allPermissions.add(p));

    // Add role permissions (including inherited)
    for (const role of userPermissions.roles) {
      this.getRolePermissions(role.id).forEach((p) => allPermissions.add(p));
    }

    return allPermissions;
  }

  /**
   * Get all permissions for a role (including inherited)
   */
  private getRolePermissions(roleId: string): Set<string> {
    const visited = new Set<string>();
    const permissions = new Set<string>();

    const traverse = (currentRoleId: string) => {
      if (visited.has(currentRoleId)) return; // Prevent cycles
      visited.add(currentRoleId);

      const role = this.hierarchy[currentRoleId];
      if (!role) return;

      // Add this role's permissions
      role.permissions.forEach((p) => permissions.add(p));

      // Traverse inherited roles
      role.inheritsFrom.forEach((parentRoleId) => traverse(parentRoleId));
    };

    traverse(roleId);
    return permissions;
  }

  /**
   * Check if permissions match (supports wildcards)
   */
  matchesPermission(required: string, granted: string): boolean {
    // Exact match
    if (required === granted) return true;

    // Wildcard match: "users:*" grants "users:read", "users:write", etc.
    const requiredParts = required.split(":");
    const grantedParts = granted.split(":");

    if (grantedParts[grantedParts.length - 1] === "*") {
      // Check if all parts before the wildcard match
      for (let i = 0; i < grantedParts.length - 1; i++) {
        if (requiredParts[i] !== grantedParts[i]) {
          return false;
        }
      }
      return true;
    }

    return false;
  }
}

export async function checkPermissions(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  userPermissions: UserPermissions,
  requiredPermissions: string[],
  config: AuthorizationConfig,
): Promise<boolean> {
  // Custom evaluator
  if (config.evaluatePermission) {
    return await config.evaluatePermission(
      ctx,
      requiredPermissions,
      userPermissions,
    );
  }

  // Default: build evaluator and check
  const evaluator = new PermissionEvaluator(ctx);
  await evaluator.buildHierarchy(userPermissions.tenantId);
  
  const userPerms = evaluator.getAllPermissions(userPermissions);

  // User must have ALL required permissions
  return requiredPermissions.every((required) =>
    Array.from(userPerms).some((granted) =>
      evaluator.matchesPermission(required, granted),
    ),
  );
}
```

### 4. Tenant Isolation

Enforce strict tenant-level data isolation:

```typescript
// src/middleware/authorization/tenant-isolation.ts
import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Middleware to enforce tenant isolation in authorization checks
 */
export function createTenantIsolationMiddleware() {
  return async (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    next: Next,
  ) => {
    const requestTenantId = ctx.var.tenant_id;
    const userPermissions = ctx.var.user_permissions as UserPermissions | undefined;

    if (!requestTenantId) {
      throw new HTTPException(400, { 
        message: "Tenant ID is required" 
      });
    }

    // Verify user's permissions belong to the same tenant
    if (userPermissions && userPermissions.tenantId !== requestTenantId) {
      throw new HTTPException(403, {
        message: "Cross-tenant access denied",
        cause: {
          userTenant: userPermissions.tenantId,
          requestTenant: requestTenantId,
        },
      });
    }

    // Verify resource access is within tenant
    const resourceTenantId = await extractResourceTenantId(ctx);
    if (resourceTenantId && resourceTenantId !== requestTenantId) {
      throw new HTTPException(403, {
        message: "Access to resources from different tenant denied",
      });
    }

    return await next();
  };
}

/**
 * Extract tenant ID from resource being accessed
 */
async function extractResourceTenantId(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<string | null> {
  // Example: for /api/v2/users/:userId, extract tenant from user record
  const userId = ctx.req.param("userId");
  if (userId) {
    const { data } = ctx.env;
    const tenantId = ctx.var.tenant_id;
    if (!tenantId) return null;

    const user = await data.users.get(tenantId, userId);
    return user?.tenant_id || null;
  }

  // Add more resource type checks as needed
  return null;
}
```

### 5. Resource-Based Authorization

Implement fine-grained resource-level permissions:

```typescript
// src/middleware/authorization/resource-based.ts

interface ResourcePolicy {
  resource: string;
  action: string;
  condition: (ctx: Context, resource: unknown) => Promise<boolean>;
}

export class ResourceAuthorizer {
  private policies: ResourcePolicy[] = [];

  /**
   * Register a resource policy
   */
  registerPolicy(policy: ResourcePolicy): void {
    this.policies.push(policy);
  }

  /**
   * Check if user can perform action on resource
   */
  async authorize(
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    resourceType: string,
    action: string,
    resource: unknown,
  ): Promise<boolean> {
    // Find matching policy
    const policy = this.policies.find(
      (p) => p.resource === resourceType && p.action === action,
    );

    if (!policy) {
      // No policy defined, default to deny
      return false;
    }

    return await policy.condition(ctx, resource);
  }
}

// Example: User can only delete their own posts
const authorizer = new ResourceAuthorizer();

authorizer.registerPolicy({
  resource: "post",
  action: "delete",
  condition: async (ctx, resource) => {
    const post = resource as { userId: string; tenantId: string };
    const userId = ctx.var.user_id;
    const tenantId = ctx.var.tenant_id;

    // User must be the owner
    if (post.userId !== userId) {
      // Unless they have admin permission
      const userPermissions = ctx.var.user_permissions as UserPermissions;
      const evaluator = new PermissionEvaluator(ctx);
      await evaluator.buildHierarchy(tenantId!);
      const perms = evaluator.getAllPermissions(userPermissions);
      
      return perms.has("posts:admin") || perms.has("posts:*");
    }

    // Verify tenant isolation
    return post.tenantId === tenantId;
  },
});

// Usage in route handler
app.delete("/api/v2/posts/:postId", async (ctx) => {
  const postId = ctx.req.param("postId");
  const { data } = ctx.env;
  const tenantId = ctx.var.tenant_id!;

  const post = await data.posts.get(tenantId, postId);
  if (!post) {
    throw new HTTPException(404, { message: "Post not found" });
  }

  // Check resource-level permission
  const canDelete = await authorizer.authorize(ctx, "post", "delete", post);
  if (!canDelete) {
    throw new HTTPException(403, { message: "Cannot delete this post" });
  }

  await data.posts.delete(tenantId, postId);
  return ctx.json({ success: true });
});
```

## Complete Example: Multi-Application RBAC

Here's a complete example combining all concepts:

```typescript
// src/index.ts
import { init } from "@authhero/authhero";
import { createKyselyAdapter } from "@authhero/kysely";
import { 
  createAuthorizationMiddleware,
  createTenantIsolationMiddleware,
  ResourceAuthorizer,
} from "./middleware/authorization";

// Create adapters
const dataAdapter = createKyselyAdapter(db);

// Initialize AuthHero
const { app, managementApp } = init({
  dataAdapter,
  // ... other config
});

// Configure authorization
const authzMiddleware = createAuthorizationMiddleware({
  cacheTTL: 300, // 5 minutes
  
  // Custom permission evaluator with time-based access
  evaluatePermission: async (ctx, required, user) => {
    // Build evaluator
    const evaluator = new PermissionEvaluator(ctx);
    await evaluator.buildHierarchy(user.tenantId);
    const perms = evaluator.getAllPermissions(user);

    // Check if user has base permissions
    const hasBasicPermission = required.every((req) =>
      Array.from(perms).some((granted) =>
        evaluator.matchesPermission(req, granted),
      ),
    );

    if (!hasBasicPermission) return false;

    // Additional time-based check for sensitive operations
    if (required.includes("users:delete")) {
      const hour = new Date().getHours();
      // Only allow deletions during business hours (9-5)
      if (hour < 9 || hour > 17) {
        return false;
      }
    }

    return true;
  },
  
  // Audit logging
  auditLog: async (ctx, decision, required) => {
    const { data } = ctx.env;
    const tenantId = ctx.var.tenant_id;
    const userId = ctx.var.user_id;

    if (!tenantId || !userId) return;

    await data.logs.create(tenantId, {
      type: "authorization",
      date: new Date().toISOString(),
      log_id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      description: `Authorization ${decision}: ${required.join(", ")}`,
      details: JSON.stringify({
        decision,
        required,
        path: ctx.req.path,
        method: ctx.req.method,
      }),
    });
  },
});

// Apply middleware to management API
managementApp.use("/api/v2/*", authzMiddleware);
managementApp.use("/api/v2/*", createTenantIsolationMiddleware());

// Export configured app
export default app;
```

## Permission Patterns

### 1. Hierarchical Permissions

```typescript
// Define permission hierarchy
const permissionHierarchy = {
  "users:*": ["users:read", "users:write", "users:delete"],
  "users:write": ["users:read"],
  "admin:*": ["users:*", "roles:*", "settings:*"],
};

// Grant high-level permission, get all sub-permissions
// Admin role with "admin:*" gets all admin permissions
```

### 2. Resource-Scoped Permissions

```typescript
// Different scopes for different contexts
const permissions = [
  "users:read:own",        // Can only read own user data
  "users:read:org",        // Can read users in same organization
  "users:read:tenant",     // Can read all users in tenant
  "users:read:global",     // Can read users across all tenants (super admin)
];
```

### 3. Conditional Permissions

```typescript
// Time-based permissions
{
  name: "users:delete",
  conditions: [
    {
      type: "time",
      rule: "business_hours",
      params: { start: 9, end: 17 },
    },
  ],
}

// Location-based permissions
{
  name: "data:export",
  conditions: [
    {
      type: "location",
      rule: "allowed_countries",
      params: { countries: ["US", "CA", "EU"] },
    },
  ],
}

// Resource ownership
{
  name: "post:edit",
  conditions: [
    {
      type: "resource_owner",
      rule: "owns_resource",
    },
  ],
}
```

## Testing Authorization

### Unit Tests

```typescript
// test/middleware/authorization.spec.ts
import { describe, it, expect } from "vitest";

describe("Authorization Middleware", () => {
  it("should allow users with required permissions", async () => {
    const user = {
      userId: "user1",
      tenantId: "tenant1",
      roles: [{ id: "admin", name: "Admin", permissions: ["users:read"] }],
      directPermissions: [],
    };

    const hasPermission = await checkPermissions(
      ctx,
      user,
      ["users:read"],
      {},
    );

    expect(hasPermission).toBe(true);
  });

  it("should deny users without required permissions", async () => {
    const user = {
      userId: "user1",
      tenantId: "tenant1",
      roles: [{ id: "viewer", name: "Viewer", permissions: ["users:read"] }],
      directPermissions: [],
    };

    const hasPermission = await checkPermissions(
      ctx,
      user,
      ["users:delete"],
      {},
    );

    expect(hasPermission).toBe(false);
  });

  it("should support wildcard permissions", async () => {
    const user = {
      userId: "user1",
      tenantId: "tenant1",
      roles: [{ id: "admin", name: "Admin", permissions: ["users:*"] }],
      directPermissions: [],
    };

    const hasPermission = await checkPermissions(
      ctx,
      user,
      ["users:delete"],
      {},
    );

    expect(hasPermission).toBe(true);
  });

  it("should enforce tenant isolation", async () => {
    const user = {
      userId: "user1",
      tenantId: "tenant1",
      roles: [],
      directPermissions: ["users:read"],
    };

    ctx.set("tenant_id", "tenant2"); // Different tenant

    await expect(
      checkPermissions(ctx, user, ["users:read"], {}),
    ).rejects.toThrow("Cross-tenant access denied");
  });
});
```

### Integration Tests

```typescript
// test/integration/authorization.spec.ts
describe("Authorization Integration", () => {
  it("should allow admin to access all endpoints", async () => {
    const token = await createAdminToken("tenant1");

    const response = await fetch("/api/v2/users", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
  });

  it("should deny regular user from accessing admin endpoints", async () => {
    const token = await createUserToken("tenant1", ["users:read"]);

    const response = await fetch("/api/v2/users/user123", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
  });
});
```

## Best Practices

1. **Cache Permissions**: Cache user permissions to avoid database queries on every request
2. **Fail Secure**: Default to deny access if permissions can't be determined
3. **Audit Everything**: Log all authorization decisions for compliance
4. **Tenant Isolation**: Always verify tenant isolation, even with valid permissions
5. **Principle of Least Privilege**: Grant minimum permissions needed
6. **Permission Granularity**: Balance between too granular (complex) and too coarse (insecure)
7. **Clear Permission Cache**: Invalidate cache when roles or permissions change
8. **Test Thoroughly**: Test both positive and negative authorization scenarios

## Related Documentation

- [RBAC and Scopes](/guides/rbac-and-scopes) - Understanding AuthHero's built-in RBAC
- [Security Model](/security-model) - Resource servers, roles, and permissions
- [Multi-Tenancy](/packages/multi-tenancy/) - Tenant isolation architecture
- [Authentication Middleware](/packages/authhero/) - Built-in authentication
