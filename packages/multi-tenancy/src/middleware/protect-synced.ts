import { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { DataAdapters } from "@authhero/adapter-interfaces";

/**
 * Bindings for the protect synced middleware
 */
interface ProtectSyncedBindings {
  data: DataAdapters;
}

/**
 * Variables expected to be set by earlier middleware
 */
interface ProtectSyncedVariables {
  tenant_id?: string;
}

/**
 * Entity types that support the synced field
 */
type SyncedEntityType = "resource_server" | "role" | "connection";

/**
 * Information about an entity parsed from the request path
 */
interface EntityInfo {
  type: SyncedEntityType;
  id: string;
}

/**
 * Parse entity type and ID from a request path
 *
 * @param path - The request path
 * @returns Entity information or null if not a recognized entity path
 */
function parseEntityFromPath(path: string): EntityInfo | null {
  const patterns: { pattern: RegExp; type: SyncedEntityType }[] = [
    { pattern: /\/api\/v2\/resource-servers\/([^/]+)$/, type: "resource_server" },
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
 * Check if an entity is synced from the main tenant
 *
 * @param adapters - Data adapters
 * @param tenantId - The tenant ID
 * @param entityInfo - Entity type and ID
 * @returns true if the entity is synced
 */
async function isSynced(
  adapters: DataAdapters,
  tenantId: string,
  entityInfo: EntityInfo,
): Promise<boolean> {
  try {
    switch (entityInfo.type) {
      case "resource_server": {
        const rs = await adapters.resourceServers.get(tenantId, entityInfo.id);
        return rs?.synced === true;
      }
      case "role": {
        const role = await adapters.roles.get(tenantId, entityInfo.id);
        return role?.synced === true;
      }
      case "connection": {
        const conn = await adapters.connections.get(tenantId, entityInfo.id);
        return conn?.synced === true;
      }
      default:
        return false;
    }
  } catch {
    // If we can't fetch the entity, assume it's not synced
    return false;
  }
}

/**
 * Get a human-readable entity type name
 *
 * @param type - The entity type
 * @returns Human-readable name
 */
function getEntityTypeName(type: SyncedEntityType): string {
  const names: Record<SyncedEntityType, string> = {
    resource_server: "resource server",
    role: "role",
    connection: "connection",
  };
  return names[type];
}

/**
 * Creates middleware to protect synced resources from modification.
 *
 * This middleware intercepts write operations (PATCH, PUT, DELETE) on
 * entities that have been synced from the main tenant and returns a 403
 * error if modification is attempted.
 *
 * Synced resources can only be modified in the main tenant, and changes
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
  Bindings: ProtectSyncedBindings;
  Variables: ProtectSyncedVariables;
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

    const synced = await isSynced(ctx.env.data, tenantId, entityInfo);
    if (synced) {
      throw new HTTPException(403, {
        message: `This ${getEntityTypeName(entityInfo.type)} is synced from the main tenant and cannot be modified. Make changes in the main tenant instead.`,
      });
    }

    return next();
  };
}
