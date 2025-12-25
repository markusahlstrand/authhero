import { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  MultiTenancyBindings,
  MultiTenancyVariables,
  MultiTenancyConfig,
} from "../types";
import { validateTenantAccess } from "../hooks/access-control";

/**
 * Creates middleware for validating organization-based tenant access.
 *
 * This middleware checks that the token's organization claim matches
 * the target tenant ID, implementing the access control model where:
 *
 * - Main tenant: Accessible without an organization claim
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
 *     mainTenantId: "main",
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

    const targetTenantId = ctx.var.tenant_id;
    const organizationId = ctx.var.organization_id;

    if (!targetTenantId) {
      throw new HTTPException(400, {
        message: "Tenant ID not found in request",
      });
    }

    const hasAccess = validateTenantAccess(
      organizationId,
      targetTenantId,
      config.accessControl.mainTenantId,
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
 * resolves it to a tenant ID using organizations on the main tenant.
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
 *     mainTenantId: "main",
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
      // No subdomain, use main tenant
      if (config.accessControl) {
        ctx.set("tenant_id", config.accessControl.mainTenantId);
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
      // Look up organization on main tenant with matching ID
      if (config.accessControl) {
        try {
          const org = await ctx.env.data.organizations.get(
            config.accessControl.mainTenantId,
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
