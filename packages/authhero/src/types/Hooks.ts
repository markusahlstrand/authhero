import { Client, User } from "@authhero/adapter-interfaces";

export type OnExecuteCredentialsExchangeEvent = {
  client: Client;
  user?: User;
  scope: string; // Space-separated list of scopes being requested
  grant_type: string; // The grant type (e.g., "password", "refresh_token")
  audience?: string; // Optional audience being requested
};

export type OnExecuteCredentialsExchangeAPI = {
  accessToken: {
    setCustomClaim: (claim: string, value: any) => void;
  };
  error: (errorCode: string, errorDescription: string) => void;
};

export type OnExecuteCredentialsExchange = (
  event: OnExecuteCredentialsExchangeEvent,
  api: OnExecuteCredentialsExchangeAPI,
) => Promise<void>;
