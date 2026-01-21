import { init, AuthHeroConfig, fetchAll, DataAdapters, Tenant } from "authhero";
import { createSyncHooks, EntitySyncConfig } from "./hooks/sync";
import { createTenantsOpenAPIRouter } from "./routes";
import {
  createProtectSyncedMiddleware,
  createControlPlaneTenantMiddleware,
  withRuntimeFallback,
} from "./middleware";

/**
 * Control plane configuration for multi-tenancy.
 */
export interface ControlPlaneConfig {
  /**
   * The control plane tenant ID - the tenant that manages all other tenants.
   */
  tenantId: string;

  /**
   * The control plane client ID used for fallback client settings.
   * This client's configuration (web_origins, callbacks, etc.) will
   * be merged with child tenant clients at runtime.
   */
  clientId: string;
}

/**
 * Configuration for multi-tenant AuthHero initialization.
 */
export interface MultiTenantConfig extends Omit<
  AuthHeroConfig,
  "entityHooks" | "managementApiExtensions"
> {
  /**
   * Control plane configuration. If provided, enables:
   * - Runtime fallback for connections, clients, and tenant settings
   * - Organization-based access control for the tenants API
   * - Automatic organization creation when tenants are created
   */
  controlPlane?: ControlPlaneConfig;

  /**
   * Control which entities to sync from control plane to child tenants.
   * Set to `false` to disable all syncing.
   * @default { resourceServers: true, roles: true }
   */
  sync?:
    | {
        resourceServers?: boolean;
        roles?: boolean;
      }
    | false;

  /**
   * Default permissions to grant when creating a tenant organization.
   * @default ["tenant:admin"]
   */
  defaultPermissions?: string[];

  /**
   * Whether to require organization match for tenant access.
   * @default false
   */
  requireOrganizationMatch?: boolean;

  /**
   * Additional management API extensions to mount.
   * The tenants router is automatically added.
   */
  managementApiExtensions?: AuthHeroConfig["managementApiExtensions"];

  /**
   * Additional entity hooks to merge with sync hooks.
   * Sync hooks will be called first, then your custom hooks.
   */
  entityHooks?: AuthHeroConfig["entityHooks"];

  /**
   * Custom function to get child tenant IDs.
   * By default, queries all tenants except the control plane.
   */
  getChildTenantIds?: () => Promise<string[]>;

  /**
   * Custom function to get adapters for a specific tenant.
   * By default, returns the main dataAdapter for all tenants.
   * Override this for per-tenant database isolation.
   */
  getAdapters?: (tenantId: string) => Promise<DataAdapters>;
}

/**
 * Result from initMultiTenant
 */
export interface MultiTenantResult {
  /** The configured Hono app */
  app: ReturnType<typeof init>["app"];
  /** The control plane tenant ID */
  controlPlaneTenantId: string;
}

/**
 * Initialize a multi-tenant AuthHero application with sensible defaults.
 *
 * This is the easiest way to set up multi-tenancy. It automatically:
 * - Creates sync hooks for resource servers and roles
 * - Mounts the tenants management API at `/tenants`
 * - Adds middleware to protect synced entities on child tenants
 * - Sets up organization-based access control (when controlPlane is configured)
 * - Wraps adapters with runtime fallback from control plane
 *
 * @param config - Multi-tenant configuration
 * @returns The configured app and control plane tenant ID
 *
 * @example Basic setup
 * ```typescript
 * import { initMultiTenant } from "@authhero/multi-tenancy";
 * import createAdapters from "@authhero/kysely-adapter";
 *
 * const dataAdapter = createAdapters(db);
 *
 * const { app } = initMultiTenant({
 *   dataAdapter,
 *   controlPlane: {
 *     tenantId: "main",
 *     clientId: "default_client",
 *   },
 * });
 *
 * export default app;
 * ```
 *
 * @example With customization
 * ```typescript
 * const { app } = initMultiTenant({
 *   dataAdapter,
 *   controlPlane: {
 *     tenantId: "main",
 *     clientId: "default_client",
 *   },
 *   sync: {
 *     resourceServers: true,
 *     roles: false, // Don't sync roles
 *   },
 *   defaultPermissions: ["tenant:admin", "tenant:read"],
 * });
 * ```
 *
 * @example Disable syncing entirely
 * ```typescript
 * const { app } = initMultiTenant({
 *   dataAdapter,
 *   controlPlane: {
 *     tenantId: "main",
 *     clientId: "default_client",
 *   },
 *   sync: false, // Each tenant manages their own entities
 * });
 * ```
 */
export function initMultiTenant(config: MultiTenantConfig): MultiTenantResult {
  const {
    dataAdapter: rawDataAdapter,
    controlPlane,
    controlPlane: {
      tenantId: controlPlaneTenantId = "control_plane",
      clientId: controlPlaneClientId,
    } = {},
    sync = { resourceServers: true, roles: true },
    defaultPermissions = ["tenant:admin"],
    requireOrganizationMatch = false,
    managementApiExtensions = [],
    entityHooks: customEntityHooks,
    getChildTenantIds,
    getAdapters,
    ...restConfig
  } = config;

  // Wrap adapters with runtime fallback from control plane (only if controlPlane is configured)
  // - dataAdapter: Full fallback with secrets (for auth flows)
  // - managementDataAdapter: Fallback with sensitive fields excluded (for management API)
  let dataAdapter = rawDataAdapter;
  let managementDataAdapter = rawDataAdapter;

  if (controlPlane) {
    dataAdapter = withRuntimeFallback(rawDataAdapter, {
      controlPlaneTenantId,
      controlPlaneClientId,
    });

    managementDataAdapter = withRuntimeFallback(rawDataAdapter, {
      controlPlaneTenantId,
      controlPlaneClientId,
      excludeSensitiveFields: true,
    });
  }

  // Determine sync settings
  const syncEnabled = sync !== false;
  const syncConfig = syncEnabled
    ? {
        resourceServers: sync.resourceServers ?? true,
        roles: sync.roles ?? true,
      }
    : { resourceServers: false, roles: false };

  // Create default getChildTenantIds if not provided
  const defaultGetChildTenantIds = async (): Promise<string[]> => {
    const allTenants = await fetchAll<Tenant>(
      (params) => dataAdapter.tenants.list(params),
      "tenants",
      { cursorField: "id", pageSize: 100 },
    );
    return allTenants
      .filter((t) => t.id !== controlPlaneTenantId)
      .map((t) => t.id);
  };

  // Create default getAdapters if not provided (single database for all tenants)
  const defaultGetAdapters = async (): Promise<DataAdapters> => dataAdapter;

  // Build sync hooks configuration
  const syncHooksConfig: EntitySyncConfig = {
    controlPlaneTenantId,
    getChildTenantIds: getChildTenantIds ?? defaultGetChildTenantIds,
    getAdapters: getAdapters ?? defaultGetAdapters,
    getControlPlaneAdapters: async () => dataAdapter,
    sync: syncConfig,
  };

  // Create sync hooks
  const { entityHooks: syncEntityHooks, tenantHooks } =
    createSyncHooks(syncHooksConfig);

  // Combine sync hooks with custom hooks using arrays
  // authhero will chain them with proper return value handling
  // Note: customEntityHooks already uses array format from AuthHeroConfig
  // Note: Connections are NOT synced - they use runtime fallback by strategy instead
  const entityHooks: AuthHeroConfig["entityHooks"] = {
    resourceServers: [
      syncEntityHooks.resourceServers,
      ...(customEntityHooks?.resourceServers ?? []),
    ],
    roles: [syncEntityHooks.roles, ...(customEntityHooks?.roles ?? [])],
    connections: customEntityHooks?.connections ?? [],
    tenants: customEntityHooks?.tenants ?? [],
    rolePermissions: customEntityHooks?.rolePermissions ?? [],
  };

  // Create tenants router
  const tenantsRouter = createTenantsOpenAPIRouter(
    {
      accessControl: {
        controlPlaneTenantId,
        requireOrganizationMatch,
        defaultPermissions,
      },
    },
    { tenants: tenantHooks },
  );

  // Initialize AuthHero
  const { app } = init({
    dataAdapter,
    managementDataAdapter,
    ...restConfig,
    entityHooks,
    managementApiExtensions: [
      ...managementApiExtensions,
      { path: "/tenants", router: tenantsRouter },
    ],
  });

  // Add middleware to resolve tenant from org_name for control plane users
  app.use("/api/v2/*", createControlPlaneTenantMiddleware(controlPlaneTenantId));

  // Add middleware to protect synced entities
  if (syncEnabled) {
    app.use("/api/v2/*", createProtectSyncedMiddleware());
  }

  return { app, controlPlaneTenantId };
}
