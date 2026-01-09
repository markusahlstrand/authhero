import { DataAdapters } from "@authhero/adapter-interfaces";
import type { SamlSigner } from "@authhero/saml/core";
import {
  OnExecuteCredentialsExchange,
  OnExecutePreUserRegistration,
  OnExecutePostUserRegistration,
  OnExecutePreUserUpdate,
  OnExecutePostLogin,
  OnContinuePostLogin,
  OnExecutePreUserDeletion,
  OnExecutePostUserDeletion,
  OnExecuteValidateRegistrationUsername,
  OnFetchUserInfo,
} from "./Hooks";
import { EntityHooksConfig } from "./AuthHeroConfig";
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
    onContinuePostLogin?: OnContinuePostLogin;
    onExecutePreUserDeletion?: OnExecutePreUserDeletion;
    onExecutePostUserDeletion?: OnExecutePostUserDeletion;
    onExecuteValidateRegistrationUsername?: OnExecuteValidateRegistrationUsername;
    /** Called when /userinfo endpoint is accessed to add custom claims */
    onFetchUserInfo?: OnFetchUserInfo;
  };

  /**
   * Entity CRUD hooks for when resources are created/updated/deleted.
   * Use these to implement cross-tenant sync, audit logging, webhooks, etc.
   */
  entityHooks?: EntityHooksConfig;

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

  // Optional URL for the service to sign SAML requests
  // If not provided, SAML signing will need to be done locally with xml-crypto
  SAML_SIGN_URL?: string;

  // Optional SAML signer instance (takes precedence over SAML_SIGN_URL)
  // Set via init({ samlSigner: ... }) to use a custom signer
  samlSigner?: SamlSigner;
};
