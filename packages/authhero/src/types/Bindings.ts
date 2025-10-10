import { DataAdapters } from "@authhero/adapter-interfaces";
import {
  OnExecuteCredentialsExchange,
  OnExecutePreUserRegistration,
  OnExecutePostUserRegistration,
  OnExecutePreUserUpdate,
  OnExecutePostLogin,
  OnExecutePreUserDeletion,
  OnExecutePostUserDeletion,
} from "./Hooks";
import { EmailService } from "./EmailService";
import { Strategy } from "../strategies";
import { smsService } from "./SMSService";

declare type Fetcher = {
  fetch: typeof fetch;
};

export type Bindings = {
  ENVIRONMENT: string;
  AUTH_URL: string;
  JWKS_URL?: string;
  JWKS_SERVICE?: Fetcher;
  ISSUER: string;
  UNIVERSAL_LOGIN_URL?: string;
  OAUTH_API_URL?: string;

  data: DataAdapters;

  hooks?: {
    onExecuteCredentialsExchange?: OnExecuteCredentialsExchange;
    onExecutePreUserRegistration?: OnExecutePreUserRegistration;
    onExecutePostUserRegistration?: OnExecutePostUserRegistration;
    onExecutePreUserUpdate?: OnExecutePreUserUpdate;
    onExecutePostLogin?: OnExecutePostLogin;
    onExecutePreUserDeletion?: OnExecutePreUserDeletion;
    onExecutePostUserDeletion?: OnExecutePostUserDeletion;
  };
  emailProviders?: { [key: string]: EmailService };
  smsProviders?: { [key: string]: smsService };

  // Tenant for default configuration
  DEFAULT_TENANT_ID?: string;
  DEFAULT_CLIENT_ID?: string;

  // Add additional strategies
  STRATEGIES?: { [strategy: string]: Strategy };

  // Constants
  JWKS_CACHE_TIMEOUT_IN_SECONDS: number;
  // This is used as CN in the certificate
  ORGANIZATION_NAME: string;

  // Url for the service to sign SAML requests
  SAML_SIGN_URL: string;
};
