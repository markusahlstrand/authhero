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

export type Bindings = {
  ENVIRONMENT: string;
  AUTH_URL: string;
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

  // Optional handler to upgrade (re-provision) a WFP tenant onto the current
  // bundle + migrations. Set via init({ tenantUpgrade: hook.onUpgrade }).
  // Drives POST /api/v2/tenants/{id}/redeploy.
  tenantUpgrade?: (tenantId: string) => Promise<void>;

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

  /**
   * Controls where Server-Timing instrumentation goes. The data/cache adapters
   * and the webhook hook always measure per-operation latency; this decides the
   * sink:
   *   - "off" (default / unset): measurements are dropped — no header, no log.
   *   - "client": emit the `Server-Timing` response header (optionally gated to
   *     SERVER_TIMING_IPS).
   *   - "log": write a structured server-side log line; never sent to the client.
   *   - "both": do both.
   * Off by default so per-operation timings — a user-enumeration / side-channel
   * surface on the public auth endpoints — are never exposed to anonymous
   * callers in production. See helpers/server-timing.ts.
   */
  SERVER_TIMING?: "off" | "client" | "log" | "both";

  /**
   * Optional comma-separated allowlist of client IPs (exact match against the
   * resolved `ip` var). When set, the "client" sink only attaches the
   * Server-Timing header for matching callers; the "log" sink is unaffected.
   * Use this to expose timings to your own IP without leaking them publicly.
   */
  SERVER_TIMING_IPS?: string;
};
