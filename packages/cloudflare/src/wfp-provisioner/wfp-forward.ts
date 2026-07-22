import type { Context, MiddlewareHandler } from "hono";
import type { TenantsDataAdapter } from "@authhero/adapter-interfaces";
import type { DispatchNamespace } from "../code-executor";

const DEFAULT_DISPATCHER_BINDING = "DISPATCHER";
const DEFAULT_SCRIPT_NAME_TEMPLATE = "tenant-{tenant_id}-auth";

/**
 * Path prefixes served from the control plane rather than dispatched to a
 * tenant worker. These are shared static assets that are byte-identical across
 * tenants and only exist on the control plane's deployment.
 *
 * `/u/widget/` is the universal-login (u2) widget bundle. It's a multi-file
 * Stencil bundle the SSR'd pages load as an ES module to hydrate the form. A
 * per-tenant dispatch worker has no static-assets binding and no configured
 * `widgetHandler`, so forwarding these requests 404s and the u2 buttons render
 * inert. Serving them from the control plane — where the assets live — keeps
 * zero per-tenant weight.
 */
const DEFAULT_LOCAL_PATHS = ["/u/widget/"];

export interface WfpForwardOptions {
  /** Tenants adapter, used to look up the resolved tenant's `deployment_type`. */
  tenants: TenantsDataAdapter;
  /**
   * The control-plane tenant id. Requests for this tenant (and anything not a
   * `wfp` tenant) fall through to the local app instead of being dispatched.
   */
  controlPlaneTenantId: string;
  /** Env binding name of the dispatch namespace. Defaults to `"DISPATCHER"`. */
  dispatcherBinding?: string;
  /**
   * Script-name convention for a tenant's worker. Supports `{tenant_id}`.
   * Defaults to `"tenant-{tenant_id}-auth"` — must match the provisioner's
   * `scriptNameTemplate`.
   */
  scriptNameTemplate?: string;
  /**
   * Resolves the tenant id for the incoming request. Defaults to reading the
   * `tenant-id` header (legacy compatibility). Replace it to resolve from a
   * subdomain or custom domain. Return `undefined` to fall through locally.
   */
  resolveTenantId?: (
    c: Context,
  ) => string | undefined | Promise<string | undefined>;
  /**
   * Request path prefixes that are **never** dispatched to a tenant worker,
   * even for a fully-provisioned `wfp` tenant. Matching requests fall through
   * to the local (control-plane) app so it serves them from its own assets /
   * handlers.
   *
   * Use this for shared static assets that only the control plane can serve —
   * a per-tenant dispatch worker has no static-assets binding. Defaults to
   * `["/u/widget/"]` (the universal-login widget bundle); pass `[]` to disable
   * the carve-out entirely, or extend the list for other shared assets.
   */
  localPaths?: string[];
}

function isDispatchNamespace(value: unknown): value is DispatchNamespace {
  return (
    typeof value === "object" &&
    value !== null &&
    "get" in value &&
    typeof Reflect.get(value, "get") === "function"
  );
}

function fillTemplate(template: string, tenantId: string): string {
  return template.replace(/\{tenant_id\}/g, tenantId);
}

/**
 * Hono middleware that forwards a request to its tenant's WFP worker over a
 * dispatch namespace, instead of serving it from the current (control-plane)
 * worker.
 *
 * For each request it resolves a tenant id, and **only** dispatches when that
 * tenant exists, has `deployment_type === "wfp"`, and is fully provisioned
 * (`provisioning_state === "ready"`). The control-plane tenant, unknown
 * tenants, shared (colocated) tenants, and tenants still provisioning (or
 * failed) all fall through to the next handler so the local app serves them —
 * dispatching to a not-yet-deployed worker would only hard-fail the request.
 * The tenant worker receives the original request verbatim and owns the full
 * response.
 *
 * Requests whose path matches `localPaths` (default `["/u/widget/"]`) are also
 * never dispatched — they are shared static assets that only the control plane
 * can serve, so a per-tenant worker would 404 them. See `DEFAULT_LOCAL_PATHS`.
 */
export function createWfpForwardMiddleware(
  options: WfpForwardOptions,
): MiddlewareHandler {
  const {
    tenants,
    controlPlaneTenantId,
    dispatcherBinding = DEFAULT_DISPATCHER_BINDING,
    scriptNameTemplate = DEFAULT_SCRIPT_NAME_TEMPLATE,
    resolveTenantId = (c) => c.req.header("tenant-id"),
    localPaths = DEFAULT_LOCAL_PATHS,
  } = options;

  return async (c, next) => {
    // Shared static assets (byte-identical across tenants, served only by the
    // control plane) must not be forwarded to a tenant worker that can't serve
    // them. Check the path before resolving the tenant so it short-circuits
    // regardless of which tenant the request would otherwise route to.
    if (localPaths.length > 0) {
      const path = c.req.path;
      if (localPaths.some((prefix) => path.startsWith(prefix))) {
        return next();
      }
    }

    const tenantId = await resolveTenantId(c);
    if (!tenantId || tenantId === controlPlaneTenantId) {
      return next();
    }

    const tenant = await tenants.get(tenantId);
    if (!tenant || tenant.deployment_type !== "wfp") {
      return next();
    }

    // Only dispatch once the tenant's worker is actually deployed. A `wfp`
    // tenant still `pending` (or `failed`) has no worker to receive the
    // request, so serve locally instead of hard-failing the dispatch.
    // `provisioning_state` defaults to `"ready"` in the schema, so treat an
    // absent value as ready and only block explicit non-ready states.
    if (tenant.provisioning_state && tenant.provisioning_state !== "ready") {
      return next();
    }

    const dispatcher = Reflect.get(c.env ?? {}, dispatcherBinding);
    if (!isDispatchNamespace(dispatcher)) {
      // No dispatch namespace bound — cannot forward, so serve locally rather
      // than hard-failing the request.
      return next();
    }

    const scriptName = fillTemplate(scriptNameTemplate, tenantId);

    let res: Response;
    try {
      res = await dispatcher.get(scriptName).fetch(c.req.raw);
    } catch (err) {
      // `dispatcher.get(name).fetch()` throws when the tenant's worker isn't in
      // the namespace ("worker not found") or fails to boot. Left unhandled this
      // surfaces as an opaque control-plane 500 that names neither the tenant
      // nor the script. Log the cause (visible in the control plane's own
      // `wrangler tail`) and return a structured, tenant-scoped error so a
      // routing/provisioning gap is distinguishable from a real upstream
      // failure — and carries the same `X-Authhero-Error` code convention the
      // tenant worker uses.
      const detail = err instanceof Error ? err.message : String(err);
      const missing = /not\s*found|no\s*such|does not exist/i.test(detail);
      const code = missing ? "wfp_worker_not_found" : "wfp_dispatch_failed";
      console.error(
        `[wfp-forward] ${code} tenant=${tenantId} script=${scriptName}: ${detail}`,
      );
      c.header("X-Authhero-Error", code);
      c.header("X-Wfp-Tenant", tenantId);
      return c.json(
        {
          error: code,
          detail: missing
            ? `Tenant '${tenantId}' is marked ready but its worker '${scriptName}' is not deployed in the dispatch namespace.`
            : `The worker for tenant '${tenantId}' could not be reached.`,
          tenant_id: tenantId,
        },
        missing ? 503 : 502,
      );
    }

    // A dispatched 5xx is the tenant worker failing. The control plane can't
    // `wrangler tail` a dispatch-namespace worker, so record which tenant/script
    // produced it — and any `X-Authhero-Error` code the worker tagged — here,
    // where that context is known. The full cause still lives in the tenant
    // worker's own logs, but this turns an opaque control-plane 500 into a
    // traceable one.
    if (res.status >= 500) {
      const code = res.headers.get("X-Authhero-Error");
      console.error(
        `[wfp-forward] tenant worker ${res.status}${
          code ? ` (${code})` : ""
        } tenant=${tenantId} script=${scriptName}`,
      );
    }

    // A response returned straight from `fetch()` / WFP dispatch carries an
    // *immutable* header guard. authhero core mounts this middleware inside its
    // CORS middleware, which (after `next()`) appends `Vary: Origin` and sets
    // `Access-Control-*` on the response — mutating immutable headers throws
    // "Can't modify immutable headers." and every dispatched request 500s.
    // Re-wrap into a fresh Response, which has the mutable "response" guard, so
    // downstream middleware (and the tenant tag below) can write headers.
    //
    // Skip the re-wrap only for a 101 Switching Protocols upgrade: it carries a
    // `webSocket` handle that a reconstructed Response would drop, breaking the
    // upgrade. Null-body statuses (204/304) are safe to re-wrap — `fetch`
    // guarantees their body is `null`, so `new Response(null, res)` is valid —
    // and re-wrapping them is what lets the CORS layer append `Vary` without
    // throwing.
    //
    // The check is a non-null `webSocket` handle, NOT `"webSocket" in res`: the
    // Cloudflare Workers runtime defines a (null) `webSocket` property on every
    // Response, so the `in` operator is always true there and would early-return
    // for ordinary responses — leaving them immutable for the CORS layer.
    const webSocket: unknown = Reflect.get(res, "webSocket");
    if (res.status === 101 || webSocket != null) {
      return res;
    }

    // Tag every dispatched response so an operator can see, from the response
    // alone, that the request was served by a tenant worker and which one.
    const wrapped = new Response(res.body, res);
    wrapped.headers.set("X-Wfp-Tenant", tenantId);
    return wrapped;
  };
}
