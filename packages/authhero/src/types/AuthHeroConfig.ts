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
} from "@authhero/adapter-interfaces";
import type { RolePermissionHooks, Hooks } from "./Hooks";
import type { SamlSigner } from "@authhero/saml/core";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
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
 * - `"builtin"` — `linkUsersHook` runs at user creation and email update,
 *   linking by verified email match. Default for backwards compatibility.
 * - `"template"` — built-in path runs AND any enabled `account-linking`
 *   template hook also runs. Use during validation; the template should be
 *   idempotent on top of the built-in.
 * - `"off"` — built-in path is skipped. Linking only happens if the tenant
 *   has enabled the `account-linking` template hook for the relevant
 *   trigger (`post-user-registration`, `post-user-update`, or
 *   `post-user-login`).
 *
 * A per-client `user_linking_mode` overrides this service-level default.
 */
export type UserLinkingMode = "builtin" | "template" | "off";

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
   * Optional powered-by logo to display at the bottom left of the login widget.
   * This is only configurable in code, not stored in the database.
   *
   * @example
   * ```typescript
   * const { app } = init({
   *   dataAdapter,
   *   poweredByLogo: {
   *     url: "https://example.com/logo.svg",
   *     alt: "Powered by Example",
   *     href: "https://example.com", // optional link
   *     height: 24, // optional height in pixels (default: 20)
   *   },
   * });
   * ```
   */
  poweredByLogo?: {
    /** URL of the logo image */
    url: string;
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
   * The handler serves the built assets from @authhero/react-admin/dist.
   *
   * @example Node.js with @hono/node-server:
   * ```typescript
   * import { serveStatic } from "@hono/node-server/serve-static";
   *
   * const adminDistPath = path.resolve(__dirname, "../node_modules/@authhero/react-admin/dist");
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
   * Read from @authhero/react-admin/dist/index.html with runtime config
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
   * @default "builtin"
   */
  userLinkingMode?: UserLinkingMode;
}
