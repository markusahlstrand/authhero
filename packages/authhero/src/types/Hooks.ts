import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  DataAdapters,
  RolePermissionInsert,
  User,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { Context } from "hono";
import { Bindings } from "./Bindings";
import { Variables } from "./Variables";

// ============================================================================
// Entity CRUD Hooks
// ============================================================================

/** Context passed to entity hooks */
export interface EntityHookContext {
  tenantId: string;
  adapters: DataAdapters;
}

/** CRUD hooks for entity operations */
export interface EntityHooks<TEntity, TInsert, TUpdate = Partial<TInsert>> {
  beforeCreate?: (ctx: EntityHookContext, data: TInsert) => Promise<TInsert>;
  afterCreate?: (ctx: EntityHookContext, entity: TEntity) => Promise<void>;
  beforeUpdate?: (
    ctx: EntityHookContext,
    id: string,
    data: TUpdate,
  ) => Promise<TUpdate>;
  afterUpdate?: (
    ctx: EntityHookContext,
    id: string,
    entity: TEntity,
  ) => Promise<void>;
  beforeDelete?: (ctx: EntityHookContext, id: string) => Promise<void>;
  afterDelete?: (ctx: EntityHookContext, id: string) => Promise<void>;
}

/** Hooks for role permission assign/remove operations */
export interface RolePermissionHooks {
  beforeAssign?: (
    ctx: EntityHookContext,
    roleId: string,
    permissions: RolePermissionInsert[],
  ) => Promise<RolePermissionInsert[]>;
  afterAssign?: (
    ctx: EntityHookContext,
    roleId: string,
    permissions: RolePermissionInsert[],
  ) => Promise<void>;
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
  id?: string;
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
  asn?: string;
  body?: Record<string, unknown>;
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
  url: string;
};

export type HookEvent = {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client?: EnrichedClient;
  request: HookRequest;
  transaction?: Transaction;
  user?: User;
  scope?: string;
  grant_type?: string;
  audience?: string;
  authentication?: {
    methods: Array<{
      name: string;
      timestamp?: string;
    }>;
  };
  authorization?: {
    roles: string[];
  };
  connection?: {
    id: string;
    name: string;
    strategy: string;
    metadata?: Record<string, unknown>;
  };
  organization?: {
    id: string;
    name: string;
    display_name: string;
    metadata?: Record<string, unknown>;
  };
  resource_server?: {
    identifier: string;
  };
  stats?: {
    logins_count: number;
  };
  tenant?: {
    id: string;
  };
  session?: {
    id?: string;
    created_at?: string;
    authenticated_at?: string;
    clients?: Array<{ client_id: string }>;
    device?: {
      initial_ip?: string;
      initial_user_agent?: string;
      last_ip?: string;
      last_user_agent?: string;
    };
  };
  security_context?: {
    ja3?: string;
    ja4?: string;
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

// ============================================================================
// Userinfo Hook
// ============================================================================

export type UserInfoEvent = {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  user: User;
  tenant_id: string;
  scopes: string[];
};

export type OnFetchUserInfoAPI = {
  setCustomClaim: (claim: string, value: unknown) => void;
};

/** Called when /userinfo endpoint is accessed */
export type OnFetchUserInfo = (
  event: UserInfoEvent,
  api: OnFetchUserInfoAPI,
) => Promise<void>;

// ============================================================================
// Shared Hooks Type
// ============================================================================

/**
 * All available auth flow hooks.
 * This type is shared between AuthHeroConfig and Bindings to ensure consistency.
 */
export type Hooks = {
  onExecuteCredentialsExchange?: OnExecuteCredentialsExchange;
  onExecutePreUserRegistration?: OnExecutePreUserRegistration;
  onExecutePostUserRegistration?: OnExecutePostUserRegistration;
  onExecutePreUserUpdate?: OnExecutePreUserUpdate;
  onExecutePostLogin?: OnExecutePostLogin;
  onExecutePreUserDeletion?: OnExecutePreUserDeletion;
  onExecutePostUserDeletion?: OnExecutePostUserDeletion;
  onExecuteValidateRegistrationUsername?: OnExecuteValidateRegistrationUsername;
  /** Called when /userinfo endpoint is accessed to add custom claims */
  onFetchUserInfo?: OnFetchUserInfo;
};
