import { DataAdapters } from "@authhero/adapter-interfaces";
import type { SamlSigner } from "@authhero/saml/core";
import { Hooks } from "./Hooks";
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

  hooks?: Hooks;

  /**
   * Entity CRUD hooks for when resources are created/updated/deleted.
   * Use these to implement cross-tenant sync, audit logging, webhooks, etc.
   */
  entityHooks?: EntityHooksConfig;

  emailProviders?: { [key: string]: EmailService };
  smsProviders?: { [key: string]: smsService };

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

  // Optional powered-by logo for the login widget
  // Set via init({ poweredByLogo: ... })
  poweredByLogo?: {
    url: string;
    alt: string;
    href?: string;
    height?: number;
  };
};
