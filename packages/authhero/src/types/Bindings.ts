import { CodeExecutor, DataAdapters } from "@authhero/adapter-interfaces";
import type { SamlSigner } from "@authhero/saml/core";
import { Hooks } from "./Hooks";
import {
  EntityHooksConfig,
  OutboxConfig,
  SigningKeyModeOption,
  UserLinkingModeOption,
  UsernamePasswordProviderResolver,
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

  // Optional base64-encoded 32-byte key (AES-256) for at-rest encryption of
  // sensitive credential fields. When set, wrap the data adapter with
  // `createEncryptedDataAdapter`. Generate with: openssl rand -base64 32
  ENCRYPTION_KEY?: string;

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
    // Optional dark-mode variant; falls back to `url` when omitted
    darkUrl?: string;
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

  // Service-level default for the built-in email-based user-linking path.
  // Set via init({ userLinkingMode: "off" | resolverFn }). A per-client
  // `user_linking_mode` overrides this default. Defaults to "builtin" when unset.
  userLinkingMode?: UserLinkingModeOption;

  // Per-tenant override for the native database provider value written on
  // new password users. When unset, all tenants use the legacy "auth2".
  // Returning "auth0" for a tenant migrates that tenant onto the "auth0"
  // provider value. TRANSITIONAL — remove once all tenants are backfilled.
  usernamePasswordProvider?: UsernamePasswordProviderResolver;

  // Per-tenant signing-key bucket selector. When unset, every tenant
  // uses the shared control-plane keys (legacy behavior). Returning
  // "tenant" for a tenant_id switches that tenant onto its own keys
  // with control-plane fallback while a tenant key is provisioned.
  signingKeyMode?: SigningKeyModeOption;

  /**
   * Allow outbound fetches (jwks_uri, request_uri) to localhost / private IP
   * ranges and over plain http. Intended for tests and local development;
   * leave unset (or false) in production so SSRF protection stays on.
   */
  ALLOW_PRIVATE_OUTBOUND_FETCH?: boolean;
};
