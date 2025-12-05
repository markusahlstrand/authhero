import { DataAdapters, Tenant } from "@authhero/adapter-interfaces";
import { Context } from "hono";

/**
 * Bindings type from authhero core - simplified version for this package
 */
export interface MultiTenancyBindings {
  data: DataAdapters;
  [key: string]: unknown;
}

/**
 * Variables type from authhero core - simplified version for this package
 */
export interface MultiTenancyVariables {
  tenant_id: string;
  organization_id?: string;
  user?: { sub: string; tenant_id: string };
  [key: string]: unknown;
}

/**
 * Context type for multi-tenancy operations
 */
export type MultiTenancyContext = Context<{
  Bindings: MultiTenancyBindings;
  Variables: MultiTenancyVariables;
}>;

/**
 * Configuration for organization-based tenant access control.
 *
 * This enables a model where:
 * - A "main" tenant manages all other tenants
 * - Organizations on the main tenant correspond to child tenants
 * - Tokens with an org claim can access the matching tenant
 * - Tokens without an org claim can only access the main tenant
 */
export interface AccessControlConfig {
  /**
   * The main/management tenant ID.
   * This is the "master" tenant that manages all other tenants.
   * Tokens without an organization claim can access this tenant.
   */
  mainTenantId: string;

  /**
   * If true, tokens must have an organization claim matching the target tenant ID
   * (except for main tenant access where no org is required).
   * @default true
   */
  requireOrganizationMatch?: boolean;

  /**
   * Permissions to automatically grant when creating an organization
   * for a new tenant on the main tenant.
   * @example ["tenant:admin", "tenant:read", "tenant:write"]
   */
  defaultPermissions?: string[];

  /**
   * Roles to automatically assign to the organization when created.
   * These roles should exist on the main tenant.
   */
  defaultRoles?: string[];
}

/**
 * Configuration for per-tenant database isolation.
 *
 * This enables scenarios where each tenant has its own database instance,
 * providing complete data isolation between tenants.
 */
export interface DatabaseIsolationConfig {
  /**
   * Factory function to get or create DataAdapters for a specific tenant.
   * This is called on each request to resolve the correct database connection.
   *
   * @param tenantId - The tenant ID to get adapters for
   * @returns DataAdapters configured for the tenant's database
   *
   * @example
   * ```typescript
   * getAdapters: async (tenantId) => {
   *   const db = await getTenantD1Binding(tenantId);
   *   return createD1Adapter(db);
   * }
   * ```
   */
  getAdapters: (tenantId: string) => Promise<DataAdapters>;

  /**
   * Called when a new tenant is created to provision its database.
   * Use this to run migrations, seed data, etc.
   *
   * @param tenantId - The ID of the newly created tenant
   *
   * @example
   * ```typescript
   * onProvision: async (tenantId) => {
   *   await createD1Database(tenantId);
   *   await runMigrations(tenantId);
   *   await seedDefaultData(tenantId);
   * }
   * ```
   */
  onProvision?: (tenantId: string) => Promise<void>;

  /**
   * Called when a tenant is being deleted to cleanup its database.
   * Use this to delete the database, backup data, etc.
   *
   * @param tenantId - The ID of the tenant being deleted
   */
  onDeprovision?: (tenantId: string) => Promise<void>;
}

/**
 * Configuration for tenant settings inheritance.
 *
 * This enables child tenants to inherit default settings from the main tenant,
 * reducing configuration overhead and ensuring consistency.
 */
export interface SettingsInheritanceConfig {
  /**
   * If true, new tenants will inherit settings from the main tenant
   * as their default configuration.
   * @default true
   */
  inheritFromMain?: boolean;

  /**
   * Specific settings keys to inherit from the main tenant.
   * If not provided, all settings are inherited.
   */
  inheritedKeys?: (keyof Tenant)[];

  /**
   * Settings keys that should NOT be inherited (blacklist approach).
   * Takes precedence over inheritedKeys.
   */
  excludedKeys?: (keyof Tenant)[];

  /**
   * Custom function to transform inherited settings before applying.
   */
  transformSettings?: (
    mainTenantSettings: Partial<Tenant>,
    newTenantId: string,
  ) => Partial<Tenant>;
}

/**
 * Configuration for subdomain-based tenant routing.
 *
 * This enables using subdomains to route requests to different tenants,
 * where the subdomain matches an organization ID on the main tenant.
 */
export interface SubdomainRoutingConfig {
  /**
   * The base domain for subdomain routing.
   * @example "auth.example.com"
   */
  baseDomain: string;

  /**
   * If true, use organizations to resolve subdomains to tenants.
   * The subdomain will be matched against organization IDs on the main tenant.
   * @default true
   */
  useOrganizations?: boolean;

  /**
   * Custom function to resolve a subdomain to a tenant ID.
   * If provided, this takes precedence over organization-based resolution.
   */
  resolveSubdomain?: (subdomain: string) => Promise<string | null>;

  /**
   * Subdomains that should not be resolved (e.g., "www", "api", "admin").
   */
  reservedSubdomains?: string[];
}

/**
 * Full multi-tenancy configuration.
 *
 * Each feature can be enabled independently, allowing you to use only
 * the parts you need:
 *
 * - **accessControl**: Organization-based tenant access validation
 * - **databaseIsolation**: Per-tenant database instances
 * - **settingsInheritance**: Inherit settings from main tenant
 * - **subdomainRouting**: Route requests via subdomains
 */
export interface MultiTenancyConfig {
  /**
   * Organization-based access control configuration.
   * Links organizations on the main tenant to tenant access.
   */
  accessControl?: AccessControlConfig;

  /**
   * Per-tenant database isolation configuration.
   */
  databaseIsolation?: DatabaseIsolationConfig;

  /**
   * Settings inheritance configuration.
   */
  settingsInheritance?: SettingsInheritanceConfig;

  /**
   * Subdomain-based tenant routing configuration.
   */
  subdomainRouting?: SubdomainRoutingConfig;
}

/**
 * Hooks interface for multi-tenancy events.
 * These hooks are called during tenant lifecycle events.
 */
export interface MultiTenancyHooks {
  /**
   * Validate if a token/request can access a specific tenant.
   * Return true to allow access, false to deny.
   *
   * @param ctx - The Hono context
   * @param targetTenantId - The tenant ID being accessed
   * @returns true if access is allowed, false otherwise
   */
  onTenantAccessValidation?: (
    ctx: MultiTenancyContext,
    targetTenantId: string,
  ) => Promise<boolean>;

  /**
   * Called after a new tenant is created.
   * Use for creating organizations, provisioning databases, etc.
   *
   * @param ctx - The Hono context
   * @param tenant - The newly created tenant
   */
  onTenantCreated?: (ctx: MultiTenancyContext, tenant: Tenant) => Promise<void>;

  /**
   * Called before a tenant is deleted.
   * Use for cleanup, organization removal, database deprovisioning, etc.
   *
   * @param ctx - The Hono context
   * @param tenantId - The ID of the tenant being deleted
   */
  onTenantDeleting?: (
    ctx: MultiTenancyContext,
    tenantId: string,
  ) => Promise<void>;

  /**
   * Resolve data adapters for a specific tenant.
   * Use for multi-database setups where each tenant has its own DB.
   *
   * @param tenantId - The tenant ID to resolve adapters for
   * @returns DataAdapters for the tenant, or undefined to use default
   */
  resolveDataAdapters?: (tenantId: string) => Promise<DataAdapters | undefined>;
}

/**
 * Result of tenant creation including any provisioned resources.
 */
export interface TenantCreateResult {
  tenant: Tenant;
  organization?: {
    id: string;
    name: string;
  };
  databaseProvisioned?: boolean;
}

/**
 * Options for listing tenants.
 */
export interface ListTenantsOptions {
  page?: number;
  per_page?: number;
  include_totals?: boolean;
  q?: string;
}

/**
 * Token payload with organization claim.
 */
export interface TokenWithOrg {
  sub: string;
  org_id?: string;
  permissions?: string[];
  [key: string]: unknown;
}
