import {
  Connection,
  ConnectionInsert,
  CreateTenantParams,
  DataAdapters,
  ResourceServer,
  ResourceServerInsert,
  Role,
  RoleInsert,
  Tenant,
} from "@authhero/adapter-interfaces";
import type { RolePermissionHooks } from "./Hooks";
import type { SamlSigner } from "@authhero/saml/core";
import {
  EntityHooks,
  OnExecuteCredentialsExchange,
  OnExecutePreUserRegistration,
  OnExecutePostUserRegistration,
  OnExecutePreUserUpdate,
  OnExecutePostLogin,
} from "./Hooks";

/**
 * Entity hooks configuration for CRUD operations.
 *
 * Use these to implement cross-tenant synchronization, audit logging,
 * webhooks, or any other side effects when entities are created/updated/deleted.
 */
export interface EntityHooksConfig {
  resourceServers?: EntityHooks<ResourceServer, ResourceServerInsert>;
  roles?: EntityHooks<Role, RoleInsert>;
  rolePermissions?: RolePermissionHooks;
  connections?: EntityHooks<Connection, ConnectionInsert>;
  tenants?: EntityHooks<Tenant, CreateTenantParams>;
}

export interface AuthHeroConfig {
  dataAdapter: DataAdapters;
  allowedOrigins?: string[];
  samlSigner?: SamlSigner;

  /**
   * Auth0-style action hooks for auth flow events.
   */
  hooks?: {
    onExecuteCredentialsExchange?: OnExecuteCredentialsExchange;
    onExecutePreUserRegistration?: OnExecutePreUserRegistration;
    onExecutePostUserRegistration?: OnExecutePostUserRegistration;
    onExecutePreUserUpdate?: OnExecutePreUserUpdate;
    onExecutePostLogin?: OnExecutePostLogin;
  };

  /**
   * Entity CRUD hooks for when resources are created/updated/deleted.
   * Use these to implement cross-tenant sync, audit logging, webhooks, etc.
   */
  entityHooks?: EntityHooksConfig;
}
