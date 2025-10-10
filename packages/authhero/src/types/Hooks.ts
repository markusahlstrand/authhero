import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  LegacyClient,
  User,
} from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { Bindings } from "./Bindings";
import { Variables } from "./Variables";

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
    countryCode3?: string;
    countryName?: string;
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
};

export type OnExecuteCredentialsExchange = (
  event: HookEvent,
  access: OnExecuteCredentialsExchangeAPI,
) => Promise<void>;

export type OnExecutePreUserRegistrationAPI = {
  user: {
    setUserMetadata: (key: string, value: any) => void;
  };
};

export type OnExecutePostUserRegistrationAPI = {
  user: {};
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
};

export type OnExecutePostLogin = (
  event: HookEvent,
  api: OnExecutePostLoginAPI,
) => Promise<void>;

export type OnExecutePreUserDeletionAPI = {
  cancel: () => void;
};

export type OnExecutePreUserDeletion = (
  event: HookEvent & { user_id: string },
  api: OnExecutePreUserDeletionAPI,
) => Promise<void>;

export type OnExecutePostUserDeletionAPI = {
  // No API methods for post-deletion - it's informational only
};

export type OnExecutePostUserDeletion = (
  event: HookEvent & { user_id: string },
  api: OnExecutePostUserDeletionAPI,
) => Promise<void>;
