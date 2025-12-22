import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  DataAdapters,
  LegacyClient,
  RolePermissionInsert,
  User,
} from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { Bindings } from "./Bindings";
import { Variables } from "./Variables";

// ============================================================================
// Entity CRUD Hooks
// ============================================================================

/**
 * Context passed to all entity hooks
 */
export interface EntityHookContext {
  /** The tenant where the operation occurred */
  tenantId: string;
  /** Data adapters for the current tenant */
  adapters: DataAdapters;
}

/**
 * CRUD hooks for any entity type.
 *
 * Use these hooks to implement cross-tenant synchronization,
 * audit logging, webhooks, or any other side effects.
 *
 * @example
 * ```typescript
 * const roleHooks: EntityHooks<Role, RoleInsert> = {
 *   afterCreate: async (ctx, role) => {
 *     // Propagate to other tenants
 *     await syncToChildTenants(ctx, role);
 *   },
 *   afterUpdate: async (ctx, id, role) => {
 *     // Log the update
 *     await auditLog('role_updated', { id, tenantId: ctx.tenantId });
 *   },
 * };
 * ```
 */
export interface EntityHooks<TEntity, TInsert, TUpdate = Partial<TInsert>> {
  /** Called before an entity is created */
  beforeCreate?: (ctx: EntityHookContext, data: TInsert) => Promise<TInsert>;

  /** Called after an entity is created */
  afterCreate?: (ctx: EntityHookContext, entity: TEntity) => Promise<void>;

  /** Called before an entity is updated */
  beforeUpdate?: (
    ctx: EntityHookContext,
    id: string,
    data: TUpdate,
  ) => Promise<TUpdate>;

  /** Called after an entity is updated */
  afterUpdate?: (
    ctx: EntityHookContext,
    id: string,
    entity: TEntity,
  ) => Promise<void>;

  /** Called before an entity is deleted */
  beforeDelete?: (ctx: EntityHookContext, id: string) => Promise<void>;

  /** Called after an entity is deleted */
  afterDelete?: (ctx: EntityHookContext, id: string) => Promise<void>;
}

/**
 * Hooks for role permission assignment operations.
 *
 * Role permissions use assign/remove operations rather than typical CRUD,
 * so they have a specialized hook interface.
 *
 * @example
 * ```typescript
 * const rolePermissionHooks: RolePermissionHooks = {
 *   afterAssign: async (ctx, roleId, permissions) => {
 *     // Sync permissions to child tenants
 *     await syncPermissionsToChildTenants(ctx, roleId, permissions);
 *   },
 * };
 * ```
 */
export interface RolePermissionHooks {
  /** Called before permissions are assigned to a role */
  beforeAssign?: (
    ctx: EntityHookContext,
    roleId: string,
    permissions: RolePermissionInsert[],
  ) => Promise<RolePermissionInsert[]>;

  /** Called after permissions are assigned to a role */
  afterAssign?: (
    ctx: EntityHookContext,
    roleId: string,
    permissions: RolePermissionInsert[],
  ) => Promise<void>;

  /** Called before permissions are removed from a role */
  beforeRemove?: (
    ctx: EntityHookContext,
    roleId: string,
    permissions: Pick<
      RolePermissionInsert,
      "resource_server_identifier" | "permission_name"
    >[],
  ) => Promise<
    Pick<
      RolePermissionInsert,
      "resource_server_identifier" | "permission_name"
    >[]
  >;

  /** Called after permissions are removed from a role */
  afterRemove?: (
    ctx: EntityHookContext,
    roleId: string,
    permissions: Pick<
      RolePermissionInsert,
      "resource_server_identifier" | "permission_name"
    >[],
  ) => Promise<void>;
}

// ============================================================================
// Auth0-style Action Hooks
// ============================================================================

export type Transaction = {
  id?: string; // Transaction ID - unique identifier for the transaction
  locale: string;
  login_hint?: string;
  prompt?: string;
  redirect_uri?: string;
  requested_scopes?: string[];
  response_mode?: AuthorizationResponseMode;
  response_type?: AuthorizationResponseType;
  state?: string;
  ui_locales?: string;
};

export type HookRequest = {
  asn?: string; // Autonomous System Number
  body?: Record<string, any>;
  geoip?: {
    cityName?: string;
    continentCode?: string;
    countryCode?: string;
    latitude?: number;
    longitude?: number;
    subdivisionCode?: string;
    subdivisionName?: string;
    timeZone?: string;
  };
  hostname?: string;
  ip: string;
  language?: string;
  method: string;
  user_agent?: string;
  // This is not part of the Auth0 event
  url: string;
};

export type HookEvent = {
  // AuthHero specific (not in Auth0)
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;

  // Auth0 compatible properties
  client?: LegacyClient;
  request: HookRequest;
  transaction?: Transaction;
  user?: User;
  scope?: string; // Space-separated list of scopes being requested
  grant_type?: string; // The grant type (e.g., "password", "refresh_token")
  audience?: string; // Optional audience being requested

  // Additional Auth0 event properties
  authentication?: {
    methods: Array<{
      name: string; // "federated", "pwd", "passkey", "sms", "email", "phone_number"
      timestamp?: string;
    }>;
  };
  authorization?: {
    roles: string[]; // Array of role names assigned to the user
  };
  connection?: {
    id: string;
    name: string;
    strategy: string; // "auth0", "waad", "ad", "google-oauth2", etc.
    metadata?: Record<string, any>;
  };
  organization?: {
    id: string;
    name: string;
    display_name: string;
    metadata?: Record<string, any>;
  };
  resource_server?: {
    identifier: string; // The audience/identifier of the resource server
  };
  stats?: {
    logins_count: number; // Number of times this user has logged in
  };
  tenant?: {
    id: string; // The tenant identifier
  };
  session?: {
    id?: string;
    created_at?: string;
    authenticated_at?: string;
    clients?: Array<{
      client_id: string;
    }>;
    device?: {
      initial_ip?: string;
      initial_user_agent?: string;
      last_ip?: string;
      last_user_agent?: string;
    };
  };
  security_context?: {
    ja3?: string; // JA3 fingerprint signature
    ja4?: string; // JA4 fingerprint signature
  };
};

export type TokenAPI = {
  createServiceToken: (params: {
    scope: string;
    expiresInSeconds?: number;
  }) => Promise<string>;
};

export type OnExecuteCredentialsExchangeAPI = {
  accessToken: {
    setCustomClaim: (claim: string, value: any) => void;
  };
  idToken: {
    setCustomClaim: (claim: string, value: any) => void;
  };
  access: {
    deny: (code: string, reason?: string) => void;
  };
  token: TokenAPI;
};

export type OnExecuteCredentialsExchange = (
  event: HookEvent,
  access: OnExecuteCredentialsExchangeAPI,
) => Promise<void>;

export type OnExecutePreUserRegistrationAPI = {
  user: {
    setUserMetadata: (key: string, value: any) => void;
  };
  token: TokenAPI;
};

export type OnExecutePostUserRegistrationAPI = {
  user: {};
  token: TokenAPI;
};

export type OnExecutePreUserRegistration = (
  event: HookEvent,
  api: OnExecutePreUserRegistrationAPI,
) => Promise<void>;

export type OnExecutePostUserRegistration = (
  event: HookEvent,
  api: OnExecutePostUserRegistrationAPI,
) => Promise<void>;

export type OnExecutePreUserUpdateAPI = {
  user: {
    setUserMetadata: (key: string, value: any) => void;
  };
  cancel: () => void;
  token: TokenAPI;
};

export type OnExecutePreUserUpdate = (
  event: HookEvent & { user_id: string; updates: Partial<User> },
  api: OnExecutePreUserUpdateAPI,
) => Promise<void>;

export type OnExecutePostLoginAPI = {
  prompt: {
    render: (formId: string) => void;
  };
  redirect: {
    sendUserTo: (
      url: string,
      options?: { query?: Record<string, string> },
    ) => void;
    encodeToken: (options: {
      secret: string;
      payload: Record<string, any>;
      expiresInSeconds?: number;
    }) => string;
    validateToken: (options: {
      secret: string;
      tokenParameterName?: string;
    }) => Record<string, any> | null;
  };
  token: TokenAPI;
};

export type OnExecutePostLogin = (
  event: HookEvent,
  api: OnExecutePostLoginAPI,
) => Promise<void>;

export type OnExecutePreUserDeletionAPI = {
  cancel: () => void;
  token: TokenAPI;
};

export type OnExecutePreUserDeletion = (
  event: HookEvent & { user_id: string },
  api: OnExecutePreUserDeletionAPI,
) => Promise<void>;

export type OnExecutePostUserDeletionAPI = {
  token: TokenAPI;
};

export type OnExecutePostUserDeletion = (
  event: HookEvent & { user_id: string },
  api: OnExecutePostUserDeletionAPI,
) => Promise<void>;

export type OnExecuteValidateRegistrationUsernameAPI = {
  deny: (reason?: string) => void;
  token: TokenAPI;
};

export type OnExecuteValidateRegistrationUsername = (
  event: Omit<HookEvent, "user"> & {
    user: { email: string; connection: string };
  },
  api: OnExecuteValidateRegistrationUsernameAPI,
) => Promise<void>;

// Backwards compatibility alias
export type OnExecuteValidateSignupEmail =
  OnExecuteValidateRegistrationUsername;
export type OnExecuteValidateSignupEmailAPI =
  OnExecuteValidateRegistrationUsernameAPI;
