import {
  Connection,
  ConnectionInsert,
  CreateTenantParams,
  DataAdapters,
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
}
