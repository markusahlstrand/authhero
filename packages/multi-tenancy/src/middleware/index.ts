import { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { MANAGEMENT_API_AUDIENCE } from "authhero";
import {
  MultiTenancyBindings,
  MultiTenancyVariables,
  MultiTenancyConfig,
} from "../types";
import { validateTenantAccess } from "../hooks/access-control";

/**
 * Creates middleware that resolves tenant_id from org_name for control plane users.
 *
 * When a user authenticates to the control plane tenant and has an org_name claim,
 * this middleware sets the tenant_id to the org_name, allowing them to access
 * that child tenant's resources.
 *
 * @param controlPlaneTenantId - The ID of the control plane tenant
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * import { createControlPlaneTenantMiddleware } from "@authhero/multi-tenancy";
 *
 * const middleware = createControlPlaneTenantMiddleware("control_plane");
 *
 * app.use("/api/*", middleware);
 * ```
 */
export function createControlPlaneTenantMiddleware(
  controlPlaneTenantId: string,
): MiddlewareHandler<{
  Bindings: MultiTenancyBindings;
  Variables: MultiTenancyVariables;
}> {
  return async (ctx, next) => {
    const user = ctx.var.user as
      | { tenant_id?: string; org_name?: string }
      | undefined;
    if (user?.tenant_id === controlPlaneTenantId && user.org_name) {
      ctx.set("tenant_id", user.org_name);
    }
    return next();
  };
}

/**
 * Creates middleware for validating organization-based tenant access.
 *
 * This middleware checks that the token's organization claim matches
 * the target tenant ID, implementing the access control model where:
 *
 * - Control plane: Accessible without an organization claim
 * - Child tenants: Require an organization claim matching the tenant ID
 *
 * @param config - Multi-tenancy configuration
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * import { createAccessControlMiddleware } from "@authhero/multi-tenancy";
 *
 * const middleware = createAccessControlMiddleware({
 *   accessControl: {
 *     controlPlaneTenantId: "main",
 *   },
 * });
 *
 * app.use("/api/*", middleware);
 * ```
 */
export function createAccessControlMiddleware(
  config: MultiTenancyConfig,
): MiddlewareHandler<{
  Bindings: MultiTenancyBindings;
  Variables: MultiTenancyVariables;
}> {
  return async (ctx, next) => {
    if (!config.accessControl) {
      // No access control configured, allow all
      return next();
    }

    const { controlPlaneTenantId } = config.accessControl;

    // Get org claims from context (set by authhero's auth middleware)
    const orgName = ctx.var.org_name;
    const organizationId = ctx.var.organization_id;
    const orgIdentifier = orgName || organizationId;

    let targetTenantId = ctx.var.tenant_id;

    // Check if this is a management token (issued by control plane for cross-tenant access)
    const user = ctx.var.user as { aud?: string | string[] } | undefined;
    const audiences = user?.aud
      ? Array.isArray(user.aud)
        ? user.aud
        : [user.aud]
      : [];
    const isManagementToken = audiences.includes(MANAGEMENT_API_AUDIENCE);

    // Only derive tenant_id from org claims for management tokens
    // This prevents regular tenant tokens from accessing other tenants
    if (!targetTenantId && orgIdentifier && isManagementToken) {
      ctx.set("tenant_id", orgIdentifier);
      targetTenantId = orgIdentifier;
    }

    // If still no tenant_id, deny access
    if (!targetTenantId) {
      throw new HTTPException(400, {
        message: "Tenant ID not found in request",
      });
    }

    const hasAccess = validateTenantAccess(
      organizationId,
      targetTenantId,
      controlPlaneTenantId,
      orgName,
    );

    if (!hasAccess) {
      throw new HTTPException(403, {
        message: `Access denied to tenant ${targetTenantId}`,
      });
    }

    return next();
  };
}

/**
 * Creates middleware for resolving tenants from subdomains.
 *
 * This middleware extracts the subdomain from the request host and
 * resolves it to a tenant ID using organizations on the control plane.
 *
 * @param config - Multi-tenancy configuration
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * import { createSubdomainMiddleware } from "@authhero/multi-tenancy";
 *
 * const middleware = createSubdomainMiddleware({
 *   subdomainRouting: {
 *     baseDomain: "auth.example.com",
 *     reservedSubdomains: ["www", "api", "admin"],
 *   },
 *   accessControl: {
 *     controlPlaneTenantId: "main",
 *   },
 * });
 *
 * app.use("*", middleware);
 * ```
 */
export function createSubdomainMiddleware(
  config: MultiTenancyConfig,
): MiddlewareHandler<{
  Bindings: MultiTenancyBindings;
  Variables: MultiTenancyVariables;
}> {
  return async (ctx, next) => {
    if (!config.subdomainRouting) {
      return next();
    }

    const {
      baseDomain,
      reservedSubdomains = [],
      resolveSubdomain,
    } = config.subdomainRouting;

    const host = ctx.req.header("host") || "";

    // Extract subdomain
    let subdomain: string | null = null;
    if (host.endsWith(baseDomain)) {
      const prefix = host.slice(0, -(baseDomain.length + 1)); // +1 for the dot
      if (prefix && !prefix.includes(".")) {
        subdomain = prefix;
      }
    }

    // Skip reserved subdomains
    if (subdomain && reservedSubdomains.includes(subdomain)) {
      subdomain = null;
    }

    if (!subdomain) {
      // No subdomain, use control plane
      if (config.accessControl) {
        ctx.set("tenant_id", config.accessControl.controlPlaneTenantId);
      }
      return next();
    }

    // Resolve subdomain to tenant ID
    let tenantId: string | null = null;

    if (resolveSubdomain) {
      // Use custom resolver
      tenantId = await resolveSubdomain(subdomain);
    } else if (config.subdomainRouting.useOrganizations !== false) {
      // Use organization-based resolution
      // Look up organization on the control plane with matching ID
      if (config.accessControl) {
        try {
          const org = await ctx.env.data.organizations.get(
            config.accessControl.controlPlaneTenantId,
            subdomain,
          );
          if (org) {
            tenantId = org.id;
          }
        } catch {
          // Organization not found
        }
      }
    }

    if (!tenantId) {
      throw new HTTPException(404, {
        message: `Tenant not found for subdomain: ${subdomain}`,
      });
    }

    ctx.set("tenant_id", tenantId);
    return next();
  };
}

/**
 * Creates middleware for resolving data adapters per tenant.
 *
 * This middleware resolves the data adapters for the target tenant,
 * enabling per-tenant database isolation.
 *
 * @param config - Multi-tenancy configuration
 * @returns Hono middleware handler
 */
export function createDatabaseMiddleware(
  config: MultiTenancyConfig,
): MiddlewareHandler<{
  Bindings: MultiTenancyBindings;
  Variables: MultiTenancyVariables;
}> {
  return async (ctx, next) => {
    if (!config.databaseIsolation) {
      return next();
    }

    const tenantId = ctx.var.tenant_id;
    if (!tenantId) {
      throw new HTTPException(400, {
        message: "Tenant ID not found in request",
      });
    }

    try {
      const adapters = await config.databaseIsolation.getAdapters(tenantId);
      // Replace the data adapters in the environment
      ctx.env.data = adapters;
    } catch (error) {
      console.error(
        `Failed to resolve database for tenant ${tenantId}:`,
        error,
      );
      throw new HTTPException(500, {
        message: "Failed to resolve tenant database",
      });
    }

    return next();
  };
}

/**
 * Creates a combined middleware stack for multi-tenancy.
 *
 * This combines subdomain routing, access control, and database resolution
 * into a single middleware chain.
 *
 * @param config - Multi-tenancy configuration
 * @returns Hono middleware handler
 */
export function createMultiTenancyMiddleware(
  config: MultiTenancyConfig,
): MiddlewareHandler<{
  Bindings: MultiTenancyBindings;
  Variables: MultiTenancyVariables;
}> {
  const subdomainMiddleware = createSubdomainMiddleware(config);
  const accessControlMiddleware = createAccessControlMiddleware(config);
  const databaseMiddleware = createDatabaseMiddleware(config);

  return async (ctx, next) => {
    // 1. Resolve tenant from subdomain (if configured)
    await subdomainMiddleware(ctx, async () => {});

    // 2. Validate access control
    await accessControlMiddleware(ctx, async () => {});

    // 3. Resolve database adapters (if configured)
    await databaseMiddleware(ctx, async () => {});

    return next();
  };
}

// Re-export protect system middleware
export { createProtectSyncedMiddleware } from "./protect-synced";

// Re-export runtime fallback adapter (for settings inheritance from control plane)
export {
  createRuntimeFallbackAdapter,
  withRuntimeFallback,
} from "./settings-inheritance";
export type { RuntimeFallbackConfig } from "./settings-inheritance";
