import { Client, User } from "@authhero/adapter-interfaces";

export type HookEvent = {
  client?: Client;
  request: Request;
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
