import { init, AuthHeroConfig, fetchAll } from "authhero";
import { DataAdapters, Tenant } from "@authhero/adapter-interfaces";
import { createSyncHooks, EntitySyncConfig } from "./hooks/sync";
import { createTenantsOpenAPIRouter } from "./routes";
import { createProtectSyncedMiddleware } from "./middleware";

/**
 * Configuration for multi-tenant AuthHero initialization.
 */
export interface MultiTenantConfig extends Omit<
  AuthHeroConfig,
  "entityHooks" | "managementApiExtensions"
> {
  /**
   * The control plane tenant ID - the tenant that manages all other tenants.
   * @default "control_plane"
   */
  controlPlaneTenantId?: string;

  /**
   * Control which entities to sync from control plane to child tenants.
   * Set to `false` to disable all syncing.
   * @default { resourceServers: true, roles: true, connections: true }
   */
  sync?:
    | {
        resourceServers?: boolean;
        roles?: boolean;
        connections?: boolean;
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
 * - Creates sync hooks for resource servers, roles, and connections
 * - Mounts the tenants management API at `/tenants`
 * - Adds middleware to protect synced entities on child tenants
 * - Sets up organization-based access control
 *
 * @param config - Multi-tenant configuration
 * @returns The configured app and control plane tenant ID
 *
 * @example
 * ```typescript
 * import { initMultiTenant } from "@authhero/multi-tenancy";
 * import createAdapters from "@authhero/kysely-adapter";
 *
 * const dataAdapter = createAdapters(db);
 *
 * const { app } = initMultiTenant({
 *   dataAdapter,
 *   // That's it! Everything else has sensible defaults.
 * });
 *
 * export default app;
 * ```
 *
 * @example With customization
 * ```typescript
 * const { app } = initMultiTenant({
 *   dataAdapter,
 *   controlPlaneTenantId: "main",
 *   sync: {
 *     resourceServers: true,
 *     roles: true,
 *     connections: false, // Don't sync connections
 *   },
 *   defaultPermissions: ["tenant:admin", "tenant:read"],
 * });
 * ```
 *
 * @example Disable syncing entirely
 * ```typescript
 * const { app } = initMultiTenant({
 *   dataAdapter,
 *   sync: false, // Each tenant manages their own entities
 * });
 * ```
 */
export function initMultiTenant(config: MultiTenantConfig): MultiTenantResult {
  const {
    dataAdapter,
    controlPlaneTenantId = "control_plane",
    sync = { resourceServers: true, roles: true, connections: true },
    defaultPermissions = ["tenant:admin"],
    requireOrganizationMatch = false,
    managementApiExtensions = [],
    entityHooks: customEntityHooks,
    getChildTenantIds,
    getAdapters,
    ...restConfig
  } = config;

  // Determine sync settings
  const syncEnabled = sync !== false;
  const syncConfig = syncEnabled
    ? {
        resourceServers: sync.resourceServers ?? true,
        roles: sync.roles ?? true,
        connections: sync.connections ?? true,
      }
    : { resourceServers: false, roles: false, connections: false };

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
    ...restConfig,
    entityHooks,
    managementApiExtensions: [
      ...managementApiExtensions,
      { path: "/tenants", router: tenantsRouter },
    ],
  });

  // Add middleware to protect synced entities
  if (syncEnabled) {
    app.use("/api/v2/*", createProtectSyncedMiddleware());
  }

  return { app, controlPlaneTenantId };
}
