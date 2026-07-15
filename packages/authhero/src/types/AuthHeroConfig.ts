import {
  CodeExecutor,
  Connection,
  ConnectionInsert,
  CreateTenantParams,
  DataAdapters,
  Hook,
  ResourceServer,
  ResourceServerInsert,
  Role,
  RoleInsert,
  Tenant,
  TenantOperation,
  TenantOperationKind,
} from "@authhero/adapter-interfaces";
import type { RolePermissionHooks, Hooks } from "./Hooks";
import type { SamlSigner } from "@authhero/saml/core";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler, MiddlewareHandler } from "hono";
import type {
  ManagementAudienceResolver,
  IssuerResolver,
} from "../middlewares/authentication";
import { EntityHooks } from "./Hooks";

/**
 * Parameters passed to a custom webhook invoker function.
 */
export interface WebhookInvokerParams {
  /** The hook being invoked (contains url, hook_id, trigger_id, etc.) */
  hook: Hook;
  /** The payload data for the webhook */
  data: Record<string, unknown>;
  /** The tenant ID */
  tenant_id: string;
  /**
   * Outbox event id for this invocation. Matches the value the default
   * invoker sends as the `Idempotency-Key` header — custom invokers should
   * forward it as the same header (or an equivalent dedupe key) so
   * downstream receivers can dedupe on outbox retries. Only set when the
   * invocation originates from the transactional outbox; the legacy inline
   * dispatcher has no stable event id to forward.
   */
  idempotency_key?: string;
  /**
   * Lazily creates a service token for authenticating with the webhook endpoint.
   * Only creates the token when called — no overhead if you use your own auth.
   *
   * @param scope - The token scope (defaults to "webhook" when used by the default invoker)
   * @returns A Bearer access token string
   */
  createServiceToken: (scope?: string) => Promise<string>;
}

/**
 * A custom function for invoking webhooks.
 *
 * When provided, this replaces the default webhook invocation logic,
 * allowing you to format the request body, add custom authentication,
 * set custom headers, etc.
 *
 * Should return a Response object. If the response is not ok (status >= 400),
 * the webhook will be logged as failed.
 *
 * @example
 * ```typescript
 * const { app } = init({
 *   dataAdapter,
 *   webhookInvoker: async ({ hook, data, tenant_id, createServiceToken }) => {
 *     // Use the built-in service token, or replace with your own auth
 *     const token = await createServiceToken();
 *     return fetch(hook.url, {
 *       method: "POST",
 *       headers: {
 *         "Authorization": `Bearer ${token}`,
 *         "Content-Type": "application/json",
 *       },
 *       body: JSON.stringify({
 *         event: data.trigger_id,
 *         payload: data,
 *       }),
 *     });
 *   },
 * });
 * ```
 */
export type WebhookInvoker = (
  params: WebhookInvokerParams,
) => Promise<Response>;

/**
 * Entity hooks configuration for CRUD operations.
 *
 * Use these to implement cross-tenant synchronization, audit logging,
 * webhooks, or any other side effects when entities are created/updated/deleted.
 *
 * Each hook type is an array of hooks that will be chained together.
 * Arrays may contain undefined elements which will be filtered out.
 * When chaining, "before" hooks pass their return values to the next hook in the chain.
 */
export interface EntityHooksConfig {
  resourceServers?: (
    | EntityHooks<ResourceServer, ResourceServerInsert>
    | undefined
  )[];
  roles?: (EntityHooks<Role, RoleInsert> | undefined)[];
  rolePermissions?: (RolePermissionHooks | undefined)[];
  connections?: (EntityHooks<Connection, ConnectionInsert> | undefined)[];
  tenants?: (EntityHooks<Tenant, CreateTenantParams> | undefined)[];
}

/**
 * Route extension for the management API.
 *
 * Allows registering additional OpenAPI routes that go through the full
 * middleware chain (caching, tenant resolution, auth, entity hooks).
 */
export interface ManagementApiExtension {
  /** The path prefix for the routes (e.g., "/tenants") */
  path: string;
  /**
   * The OpenAPI router to mount at the path.
   * Use `any` to allow routers with extended Bindings/Variables types
   * (e.g., from multi-tenancy package).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: OpenAPIHono<any, any, any>;
}

/**
 * Enqueues a durable tenant lifecycle operation (issue #1026): creates
 * the `tenant_operations` row and starts execution on the configured
 * engine. The inline engine resolves with a terminal row; durable engines
 * resolve as soon as the run is enqueued — clients poll
 * `GET /api/v2/operations/{id}`.
 */
export interface TenantOperationExecutorBinding {
  engine: string;
  enqueue(params: {
    kind: TenantOperationKind;
    tenant_id: string | null;
    initiated_by?: string;
  }): Promise<TenantOperation>;
}

/**
 * Configuration for the transactional outbox pattern.
 * When enabled, audit events are written atomically with entity mutations
 * and delivered asynchronously by a background relay.
 */
export interface OutboxConfig {
  enabled: boolean;
  /** Capture entity before/after state in audit events (default: true) */
  captureEntityState?: boolean;
  /** Days to retain processed outbox events before cleanup (default: 7) */
  retentionDays?: number;
  /** Max delivery retries before giving up on an event (default: 5) */
  maxRetries?: number;
}

/**
 * Mode for the built-in email-based user linking path.
 *
 * - `"builtin"` — `commitUserHook` runs the email→primary lookup at user
 *   creation and email update, linking by verified email match. Default
 *   for backwards compatibility.
 * - `"off"` — built-in lookup is skipped. Linking only happens if the
 *   tenant has enabled the `account-linking` template hook for the
 *   relevant trigger (`post-user-registration`, `post-user-update`, or
 *   `post-user-login`).
 *
 * The template hook is controlled independently via the management API,
 * so a tenant on `"builtin"` mode can still enable the template at
 * `post-user-login` to catch legacy unlinked accounts. Running both at
 * the same trigger is harmless but redundant — the template no-ops once
 * the built-in has set `linked_to`.
 *
 * A per-client `user_linking_mode` overrides this service-level default.
 */
export type UserLinkingMode = "builtin" | "off";

/**
 * Resolver form for the service-level user-linking mode. Receives the
 * resolved `tenant_id` (and `client_id`, when the request has one) and
 * returns the mode to use for that request. May be async.
 */
export type UserLinkingModeResolver = (params: {
  tenant_id: string;
  client_id?: string;
}) => UserLinkingMode | Promise<UserLinkingMode>;

export type UserLinkingModeOption = UserLinkingMode | UserLinkingModeResolver;

/**
 * Resolver for the per-tenant username/password provider value.
 *
 * The native database provider has historically been written as `"auth2"`;
 * new rows now default to `"auth0"`. Returning `"auth2"` for selected
 * tenants pins them on the legacy value during a staged cutover. Reads
 * always accept both values, so existing `auth2|*` rows keep resolving
 * during and after the cutover.
 *
 * TRANSITIONAL: this resolver and the dual-read fallback can be removed
 * once every tenant has been migrated to a single value.
 */
export type UsernamePasswordProviderResolver = (params: {
  tenant_id: string;
}) => "auth0" | "auth2" | Promise<"auth0" | "auth2">;

/**
 * Mode for which signing-key bucket a tenant uses when minting and
 * publishing JWTs.
 *
 * - `"control-plane"` — tenant uses the shared control-plane keys (rows
 *   with `tenant_id IS NULL`). This matches the legacy single-key-pool
 *   behavior; existing data needs no migration.
 * - `"tenant"` — tenant uses its own keys (rows with `tenant_id =
 *   tenantId`). Falls back to the control-plane bucket if the tenant has
 *   no non-revoked key yet, so flipping a tenant on is safe even before
 *   a tenant key has been minted. JWKS for that tenant publishes the
 *   union of tenant + control-plane keys so tokens signed by either set
 *   keep verifying during rotation.
 */
export type SigningKeyMode = "control-plane" | "tenant";

/**
 * Resolver form for the per-tenant signing-key mode. Receives the
 * resolved `tenant_id` and returns which bucket to use. May be async.
 */
export type SigningKeyModeResolver = (params: {
  tenant_id: string;
}) => SigningKeyMode | Promise<SigningKeyMode>;

export type SigningKeyModeOption = SigningKeyMode | SigningKeyModeResolver;

export interface AuthHeroConfig {
  dataAdapter: DataAdapters;

  /**
   * Optional separate data adapter for the management API.
   * If provided, the management API will use this adapter instead of `dataAdapter`.
   *
   * This is useful when you want different behavior for auth flows vs management API,
   * such as excluding sensitive fields from control plane fallback in management API
   * while keeping them for authentication flows.
   *
   * @example
   * ```typescript
   * const { app } = init({
   *   dataAdapter: withRuntimeFallback(baseAdapters, { controlPlaneTenantId: "main" }),
   *   managementDataAdapter: withRuntimeFallback(baseAdapters, {
   *     controlPlaneTenantId: "main",
   *     excludeSensitiveFields: true, // Don't expose control plane secrets in management API
   *   }),
   * });
   * ```
   */
  managementDataAdapter?: DataAdapters;

  allowedOrigins?: string[];
  samlSigner?: SamlSigner;

  /**
   * Auth0-style action hooks for auth flow events.
   */
  hooks?: Hooks;

  /**
   * Entity CRUD hooks for when resources are created/updated/deleted.
   * Use these to implement cross-tenant sync, audit logging, webhooks, etc.
   */
  entityHooks?: EntityHooksConfig;

  /**
   * Handler for serving widget static files at /u/widget/*.
   *
   * The widget files are served from @authhero/widget package.
   * This must be a platform-specific static file handler.
   *
   * @example Node.js with @hono/node-server:
   * ```typescript
   * import { serveStatic } from "@hono/node-server/serve-static";
   * import path from "path";
   * import { fileURLToPath } from "url";
   *
   * const __dirname = path.dirname(fileURLToPath(import.meta.url));
   * const widgetPath = path.resolve(__dirname, "../node_modules/@authhero/widget/dist/authhero-widget");
   *
   * const { app } = init({
   *   dataAdapter,
   *   widgetHandler: serveStatic({
   *     root: widgetPath,
   *     rewriteRequestPath: (p) => p.replace("/u/widget", ""),
   *   }),
   * });
   * ```
   *
   * @example Bun:
   * ```typescript
   * import { serveStatic } from "hono/bun";
   *
   * const { app } = init({
   *   dataAdapter,
   *   widgetHandler: serveStatic({
   *     root: "./node_modules/@authhero/widget/dist/authhero-widget",
   *     rewriteRequestPath: (p) => p.replace("/u/widget", ""),
   *   }),
   * });
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  widgetHandler?: Handler<any>;

  /**
   * Additional routes to mount on the management API.
   *
   * These routes go through the full middleware chain:
   * - CORS
   * - Data hooks & caching
   * - Client info extraction
   * - Tenant resolution
   * - Authentication (reads OpenAPI security definitions)
   * - Entity hooks
   *
   * @example
   * ```typescript
   * import { init } from "authhero";
   * import { createTenantsOpenAPIRouter } from "@authhero/multi-tenancy";
   *
   * const { app } = init({
   *   dataAdapter,
   *   managementApiExtensions: [
   *     { path: "/tenants", router: createTenantsOpenAPIRouter(config, hooks) }
   *   ]
   * });
   * ```
   */
  managementApiExtensions?: ManagementApiExtension[];

  /**
   * Optional privileged control-plane endpoint for the `@authhero/proxy`
   * data plane. When set, mounts `GET /api/v2/proxy/control-plane/hosts/:host`
   * which returns the cross-tenant `ResolvedHost` for the given hostname.
   *
   * Authentication is opinionated and built in: incoming requests must
   * carry a `Bearer` JWT whose `iss` is either the runtime `env.ISSUER`
   * or the host the request landed on (tenant subdomain or registered
   * custom domain). The verifier fetches `<iss>/.well-known/jwks.json` to
   * validate the signature, so each accepted host must publish its own
   * JWKS at that path. Tokens must also carry the `proxy:resolve_host`
   * scope. The matching client-side helper is `createHttpProxyAdapter`
   * in `@authhero/proxy`.
   */
  proxyControlPlane?: {
    resolveHost: (
      host: string,
    ) => Promise<import("@authhero/proxy").ResolvedHost | null>;
    /**
     * Optional fetch override for the per-issuer JWKS document. Called
     * with the derived URL (`<iss>/.well-known/jwks.json`); defaults to
     * global `fetch`. Hosts on Cloudflare Workers can route specific
     * hosts through a service binding by inspecting the URL.
     */
    jwksFetch?: (url: string) => Promise<Response>;
    /**
     * Optional predicate widening the accepted token issuers beyond
     * `env.ISSUER` / the inbound host to a deployment's own WFP tenant
     * subdomains, whose per-tenant control-plane credential `jwksFetch`
     * resolves locally (see #1139). Consulted before any JWKS fetch; return
     * `true` only for issuer hosts you serve.
     */
    isTrustedIssuer?: (iss: string) => boolean;
    /**
     * Optional receiver for `POST /sync` events emitted by tenant shards via
     * the `ControlPlaneSyncDestination`. Mount on the control-plane authhero
     * instance only. Implementations MUST be idempotent — the outbox retries
     * on transient failures. Use `createApplySyncEvents({ proxyRoutes })`
     * (exported from `authhero`) for the default adapter-backed
     * implementation.
     */
    applySyncEvents?: (
      events: import("../helpers/control-plane-sync-events").SyncEvent[],
    ) => Promise<void>;
    /**
     * The authoritative custom-domains adapter. When set, mounts
     * `/api/v2/proxy/control-plane/custom-domains` — the resource tenant
     * shards write through (`createControlPlaneCustomDomainsAdapter`).
     *
     * Pass the Cloudflare adapter wrapping the control-plane database: a
     * CF-for-SaaS hostname is an account-global resource, so registering it
     * needs credentials that only exist here, and claiming it exactly once
     * needs a view across every tenant that only exists here.
     */
    customDomains?: import("@authhero/adapter-interfaces").CustomDomainsAdapter;

    /**
     * The authoritative tenant-team resource. When set, mounts
     * `/api/v2/proxy/control-plane/tenant-members` — the resource tenant shards
     * call through `createControlPlaneTenantMembersAdapter` so their admins can
     * manage who administers the tenant (control-plane organization membership
     * + org-scoped roles + invitations). Wire the backend to the control-plane
     * database via `createLocalTenantMembersBackend`.
     */
    tenantMembers?: import("../routes/proxy-control-plane/tenant-members").TenantMembersControlPlaneOptions;
  };

  /**
   * Enables the tenant-scoped `/api/v2/tenant-members` management resource,
   * which lets a tenant admin manage their own team from the per-tenant admin
   * UI. Every request is pinned to the caller's `org_name` claim, then
   * delegated to the backend this returns.
   *
   * Return `createLocalTenantMembersBackend(...)` on a single-instance /
   * control-plane deployment (the team lives in the same database), or
   * `createControlPlaneTenantMembersAdapter(...)` on a Workers-for-Platforms
   * shard (the team lives on the control plane and is reached over the shared
   * control-plane client). Leave unset to not mount the resource.
   */
  tenantMembers?: {
    getBackend: import("../routes/management-api/tenant-members").GetTenantMembersBackend;
  };

  /**
   * Optional outbox-driven replication of `proxy_routes` mutations to a global
   * proxy control plane. When set, every successful write on this tenant shard
   * enqueues a `controlplane.sync.*` outbox event; the
   * `ControlPlaneSyncDestination` POSTs each event to
   * `${baseUrl}/api/v2/proxy/control-plane/sync`. Requires the outbox to be
   * enabled (`outbox: { enabled: true }`).
   *
   * Custom domains are NOT replicated this way — the control plane is
   * authoritative for them; wire `createControlPlaneCustomDomainsAdapter` into
   * the shard's `dataAdapter` instead.
   *
   * Leave unset for single-DB deployments — the proxy reads the same database
   * the management API writes to, so replication is unnecessary.
   */
  controlPlaneSync?: {
    /** Base URL of the control-plane authhero instance. */
    baseUrl: string;
    /** Per-request timeout for the sync POST (default: 10_000ms). */
    timeoutMs?: number;
  };

  /**
   * Optional middleware that dispatches a management-API request to its
   * tenant's own worker instead of serving it from this (control-plane)
   * instance — the inbound twin of the control-plane defaults projection.
   *
   * It is mounted inside the management API **after** the CORS middleware and
   * **before** the auth/data chain, so:
   *  - when it forwards (returns the tenant worker's `Response`), the central
   *    CORS middleware applies the `Access-Control-Allow-*` headers to that
   *    response — no manual CORS handling needed in the host app;
   *  - when it calls `next()` (control-plane tenant, non-`wfp` tenant, tenant
   *    not yet provisioned, or no dispatch binding), the request is served
   *    locally as usual.
   *
   * Provide the implementation from `@authhero/cloudflare-adapter`'s
   * `createWfpForwardMiddleware`, which dispatches over a Workers-for-Platforms
   * dispatch namespace. Kept as a generic Hono `MiddlewareHandler` so authhero
   * core carries no dispatch-namespace dependency.
   *
   * @example
   * ```typescript
   * const { app } = init({
   *   dataAdapter,
   *   allowedOrigins: ["https://admin.example.com"],
   *   tenantDispatch: createWfpForwardMiddleware({
   *     tenants: managementAdapter.tenants,
   *     controlPlaneTenantId: "main",
   *   }),
   * });
   * ```
   */
  tenantDispatch?: MiddlewareHandler;

  /**
   * Optional handler that re-provisions (upgrades) an existing WFP tenant onto
   * the control plane's current worker bundle + migrations. When set, the
   * management API exposes `POST /api/v2/tenants/{id}/redeploy` (control-plane
   * only), which invokes this handler and returns the refreshed tenant row with
   * its updated `worker_version` / `bundle_configuration` / `database_version`.
   *
   * Kept as a generic `(tenantId) => Promise<void>` so authhero core carries no
   * Cloudflare / dispatch-namespace dependency. Wire it to
   * `@authhero/cloudflare-adapter`'s provisioning hook:
   *
   * @example
   * ```typescript
   * const hook = createWfpTenantProvisioningHook({ provisioner, tenants });
   * const { app } = init({
   *   dataAdapter,
   *   tenantUpgrade: hook.onUpgrade,
   * });
   * ```
   */
  tenantUpgrade?: (tenantId: string) => Promise<void>;

  /**
   * Optional executor for durable tenant lifecycle operations (issue
   * #1026). When set together with the `tenantOperations` /
   * `tenantOperationEvents` adapters, `POST /api/v2/tenants/{id}/operations`
   * enqueues operations through it. Kept structural so authhero core
   * depends on neither `@authhero/multi-tenancy` nor any engine —
   * `@authhero/multi-tenancy`'s `enqueueTenantOperation` + executors
   * satisfy this shape.
   */
  tenantOperationExecutor?: TenantOperationExecutorBinding;

  /**
   * Optional powered-by logo to display at the bottom left of the login widget.
   * This is only configurable in code, not stored in the database.
   *
   * @example
   * ```typescript
   * const { app } = init({
   *   dataAdapter,
   *   poweredByLogo: {
   *     url: "https://example.com/logo.svg",
   *     darkUrl: "https://example.com/logo-dark.svg", // optional dark-mode variant
   *     alt: "Powered by Example",
   *     href: "https://example.com", // optional link
   *     height: 24, // optional height in pixels (default: 20)
   *   },
   * });
   * ```
   */
  poweredByLogo?: {
    /** URL of the logo image (used in light mode, and in dark mode if `darkUrl` is not provided) */
    url: string;
    /** Optional dark-mode variant; falls back to `url` when omitted */
    darkUrl?: string;
    /** Alt text for the logo */
    alt: string;
    /** Optional link URL - if provided, the logo will be clickable */
    href?: string;
    /** Optional height in pixels (default: 20) */
    height?: number;
  };

  /**
   * Code executor for user-authored code hooks.
   *
   * When provided, code hooks stored in the database will be executed
   * using this executor at auth flow trigger points.
   *
   * Available implementations:
   * - `LocalCodeExecutor` — uses `new Function()`, suitable for local dev only
   * - Custom implementations for isolated-vm, Cloudflare Workers for Platforms, etc.
   *
   * If not provided, code hooks are silently skipped.
   */
  codeExecutor?: CodeExecutor;

  /**
   * Custom webhook invoker function.
   *
   * When provided, this replaces the default webhook invocation logic,
   * allowing you to format the request body, add custom authentication,
   * set custom headers, etc.
   *
   * If not provided, webhooks are invoked with a POST request containing
   * a JSON body and a Bearer token generated by the built-in service token creator.
   */
  webhookInvoker?: WebhookInvoker;

  /**
   * Handler for serving admin UI static files (JS, CSS, images) at /admin/*.
   *
   * This must be a platform-specific static file handler, similar to widgetHandler.
   * The handler serves the built assets from @authhero/admin/dist.
   *
   * @example Node.js with @hono/node-server:
   * ```typescript
   * import { serveStatic } from "@hono/node-server/serve-static";
   *
   * const adminDistPath = path.resolve(__dirname, "../node_modules/@authhero/admin/dist");
   *
   * const { app } = init({
   *   dataAdapter,
   *   adminHandler: serveStatic({
   *     root: adminDistPath,
   *     rewriteRequestPath: (p) => p.replace("/admin", ""),
   *   }),
   * });
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminHandler?: Handler<any>;

  /**
   * Pre-configured index.html string for the admin UI SPA fallback.
   *
   * Read from @authhero/admin/dist/index.html with runtime config
   * injected via a `<script>window.__AUTHHERO_ADMIN_CONFIG__=...</script>` tag.
   *
   * When provided, all non-asset requests to /admin/* will return this HTML,
   * enabling client-side routing in the admin SPA.
   */
  adminIndexHtml?: string;

  /**
   * Transactional outbox configuration.
   * When enabled, audit events are written atomically within the same
   * database transaction as entity mutations, then delivered asynchronously
   * by a background relay to the logs table (and other destinations).
   */
  outbox?: OutboxConfig;

  /**
   * Default mode for the built-in email-based user-linking path.
   *
   * Controls whether `linkUsersHook` performs an automatic primary-user
   * lookup by verified email at user creation and email update. A per-client
   * `user_linking_mode` setting overrides this default.
   *
   * Accepts either a static value or a resolver function that receives
   * `{ tenant_id, client_id }` and returns the mode (sync or async). Use
   * the resolver form to disable built-in linking on a per-tenant basis.
   *
   * @default "builtin"
   */
  userLinkingMode?: UserLinkingModeOption;

  /**
   * Per-tenant override for the username/password provider value used on
   * NEW user rows. Omit to write `"auth0"` for every tenant — new signups,
   * password resets, etc. use the `auth0|*` user_id format. Existing
   * `auth2|*` rows keep working — reads accept either value.
   *
   * Returning `"auth2"` pins a tenant on the legacy value during a staged
   * cutover.
   *
   * TRANSITIONAL: this hook and the dual-read fallback in the password
   * flows can be removed once all tenants have been backfilled.
   */
  usernamePasswordProvider?: UsernamePasswordProviderResolver;

  /**
   * Per-tenant control over which signing-key bucket a tenant uses.
   *
   * Accepts either a static value or a resolver that receives
   * `{ tenant_id }` and returns the mode. Use the resolver form to
   * migrate tenants onto their own keys one at a time.
   *
   * Omit (or set to `"control-plane"`) to preserve the legacy behavior
   * where every tenant shares the control-plane keys.
   *
   * TRANSITIONAL: once every tenant is on `"tenant"` and the
   * control-plane bucket has been retired, this option and the
   * fallback path can be removed.
   *
   * @default "control-plane"
   */
  signingKeyMode?: SigningKeyModeOption;

  /**
   * Relax the management API audience check from a hard 403 to a
   * `console.warn`. Tokens issued for any other audience will still be
   * accepted as long as they carry a matching scope/permission string.
   *
   * TRANSITIONAL: enable only while migrating clients to request the
   * `urn:authhero:management` audience. Watch the warn logs to identify
   * the remaining offenders, then flip this back off — the audience check
   * is a defense-in-depth control against tokens minted with
   * attacker-chosen scopes for an unregistered audience.
   *
   * @default false
   */
  relaxManagementAudience?: boolean;

  /**
   * Resolver returning the list of audiences accepted by the management
   * API audience check **in addition to** the built-in
   * `urn:authhero:management`. The token's `tenant_id` is passed in, so a
   * per-tenant identifier can be constructed at request time alongside any
   * global legacy identifiers.
   *
   * The default audience is always accepted; the resolver is purely additive.
   *
   * @example
   * ```ts
   * additionalManagementAudiences: ({ tenant_id }) => [
   *   "https://token.example.com/v2/api/",
   *   `https://${tenant_id}.token.example.com/v2/api/`,
   * ];
   * ```
   */
  additionalManagementAudiences?: ManagementAudienceResolver;

  /**
   * Resolver returning the list of issuers accepted by the bearer-JWT issuer
   * check **in addition to** the deployment's own
   * `getIssuer(env, custom_domain)`. The token's `tenant_id` is passed in, so a
   * per-tenant or control-plane issuer can be constructed at request time.
   *
   * This is needed when control-plane-minted admin tokens are forwarded to a
   * per-tenant worker: the token's `iss` is the control-plane issuer while the
   * worker's `env.ISSUER` is per-tenant, so the strict single-issuer check
   * would otherwise reject it. The signature is still verified normally; this
   * only widens which `iss` values are accepted.
   *
   * authhero stays generic — it never derives or hardcodes any issuer. Scoping
   * (e.g. only accepting the control-plane issuer for control-plane tokens) is
   * the host app's job: the resolver receives `tenant_id` and can return `[]`
   * to refuse. The default issuer is always accepted; the resolver is purely
   * additive.
   *
   * @example
   * ```ts
   * additionalIssuers: ({ tenant_id }) =>
   *   tenant_id ? ["https://token.example.com/"] : [];
   * ```
   */
  additionalIssuers?: IssuerResolver;
}
