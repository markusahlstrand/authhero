import { DataAdapters } from "@authhero/adapter-interfaces";
import { OnExecuteCredentialsExchange } from "./Hooks";
import { EmailService } from "./EmailService";

declare type Fetcher = {
  fetch: typeof fetch;
};

export type Bindings = {
  ENVIRONMENT: string;
  AUTH_URL: string;
  JWKS_URL: string;
  JWKS_SERVICE: Fetcher;
  ISSUER: string;

  data: DataAdapters;

  hooks?: {
    onExecuteCredentialsExchange?: OnExecuteCredentialsExchange;
  };
  emailProvders?: { [key: string]: EmailService };

  // Constants
  JWKS_CACHE_TIMEOUT_IN_SECONDS: number;
  // This is used as CN in the certificate
  ORGANIZATION_NAME: string;
};
