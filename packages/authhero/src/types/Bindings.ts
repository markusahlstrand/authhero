import { CodeExecutor, DataAdapters } from "@authhero/adapter-interfaces";
import type { SamlSigner } from "@authhero/saml/core";
import { Hooks } from "./Hooks";
import {
  EntityHooksConfig,
  OutboxConfig,
  WebhookInvoker,
} from "./AuthHeroConfig";
import { StrategyHandler } from "../strategies";

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

  // Add additional strategies
  STRATEGIES?: { [strategy: string]: StrategyHandler };

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

  // Optional code executor for user-authored code hooks
  // Set via init({ codeExecutor: ... })
  codeExecutor?: CodeExecutor;

  // Optional custom webhook invoker
  // Set via init({ webhookInvoker: ... })
  webhookInvoker?: WebhookInvoker;

  // Optional transactional outbox configuration
  // Set via init({ outbox: { enabled: true } })
  outbox?: OutboxConfig;
};
