import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
  Client,
  User,
} from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { Bindings } from "./Bindings";
import { Variables } from "./Variables";

export type Transaction = {
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
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client?: Client;
  request: HookRequest;
  transaction?: Transaction;
  user?: User;
  scope?: string; // Space-separated list of scopes being requested
  grant_type?: string; // The grant type (e.g., "password", "refresh_token")
  audience?: string; // Optional audience being requested
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

export type OnExecutePostLoginAPI = {
  prompt: {
    render: (formId: string) => void;
  };
};

export type OnExecutePostLogin = (
  event: HookEvent,
  api: OnExecutePostLoginAPI,
) => Promise<void>;
