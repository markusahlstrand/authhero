import { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { DataAdapters } from "@authhero/adapter-interfaces";

/**
 * Bindings for the protect system middleware
 */
interface ProtectSystemBindings {
  data: DataAdapters;
}

/**
 * Variables expected to be set by earlier middleware
 */
interface ProtectSystemVariables {
  tenant_id?: string;
}

/**
 * Entity types that support the is_system field
 */
type SystemEntityType = "resource_server" | "role" | "connection";

/**
 * Information about an entity parsed from the request path
 */
interface EntityInfo {
  type: SystemEntityType;
  id: string;
}

/**
 * Parse entity type and ID from a request path
 *
 * @param path - The request path
 * @returns Entity information or null if not a recognized entity path
 */
function parseEntityFromPath(path: string): EntityInfo | null {
  const patterns: { pattern: RegExp; type: SystemEntityType }[] = [
    {
      pattern: /\/api\/v2\/resource-servers\/([^/]+)$/,
      type: "resource_server",
    },
    { pattern: /\/api\/v2\/roles\/([^/]+)$/, type: "role" },
    { pattern: /\/api\/v2\/connections\/([^/]+)$/, type: "connection" },
  ];

  for (const { pattern, type } of patterns) {
    const match = path.match(pattern);
    if (match && match[1]) {
      return { type, id: match[1] };
    }
  }

  return null;
}

/**
 * Check if an entity is a system entity from the control plane
 *
 * @param adapters - Data adapters
 * @param tenantId - The tenant ID
 * @param entityInfo - Entity type and ID
 * @returns true if the entity is a system entity
 */
async function isSystemEntity(
  adapters: DataAdapters,
  tenantId: string,
  entityInfo: EntityInfo,
): Promise<boolean> {
  try {
    switch (entityInfo.type) {
      case "resource_server": {
        const rs = await adapters.resourceServers.get(tenantId, entityInfo.id);
        return rs?.is_system === true;
      }
      case "role": {
        const role = await adapters.roles.get(tenantId, entityInfo.id);
        return role?.is_system === true;
      }
      case "connection": {
        const conn = await adapters.connections.get(tenantId, entityInfo.id);
        return conn?.is_system === true;
      }
      default:
        return false;
    }
  } catch {
    // If we can't fetch the entity, assume it's not a system entity
    return false;
  }
}

/**
 * Get a human-readable entity type name
 *
 * @param type - The entity type
 * @returns Human-readable name
 */
function getEntityTypeName(type: SystemEntityType): string {
  const names: Record<SystemEntityType, string> = {
    resource_server: "resource server",
    role: "role",
    connection: "connection",
  };
  return names[type];
}

/**
 * Creates middleware to protect system resources from modification.
 *
 * This middleware intercepts write operations (PATCH, PUT, DELETE) on
 * entities that are marked as system entities from the control plane and returns a 403
 * error if modification is attempted.
 *
 * System resources can only be modified in the control plane, and changes
 * will be propagated to child tenants automatically.
 *
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * import { createProtectSyncedMiddleware } from "@authhero/multi-tenancy";
 *
 * // Apply to management API routes
 * app.use("/api/v2/*", createProtectSyncedMiddleware());
 * ```
 */
export function createProtectSyncedMiddleware(): MiddlewareHandler<{
  Bindings: ProtectSystemBindings;
  Variables: ProtectSystemVariables;
}> {
  return async (ctx, next) => {
    // Only check write operations
    if (!["PATCH", "PUT", "DELETE"].includes(ctx.req.method)) {
      return next();
    }

    const entityInfo = parseEntityFromPath(ctx.req.path);
    if (!entityInfo) {
      return next();
    }

    // Get tenant ID from context variable or header
    const tenantId =
      ctx.var.tenant_id ||
      ctx.req.header("x-tenant-id") ||
      ctx.req.header("tenant-id");

    if (!tenantId) {
      return next();
    }

    const isSystem = await isSystemEntity(ctx.env.data, tenantId, entityInfo);
    if (isSystem) {
      throw new HTTPException(403, {
        message: `This ${getEntityTypeName(entityInfo.type)} is a system resource and cannot be modified. Make changes in the control plane instead.`,
      });
    }

    return next();
  };
}
