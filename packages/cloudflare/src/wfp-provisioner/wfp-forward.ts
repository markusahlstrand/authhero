import type { Context, MiddlewareHandler } from "hono";
import type { TenantsDataAdapter } from "@authhero/adapter-interfaces";
import type { DispatchNamespace } from "../code-executor";

const DEFAULT_DISPATCHER_BINDING = "DISPATCHER";
const DEFAULT_SCRIPT_NAME_TEMPLATE = "tenant-{tenant_id}-auth";

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
  resolveTenantId?: (c: Context) => string | undefined | Promise<string | undefined>;
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
  } = options;

  return async (c, next) => {
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
    return dispatcher.get(scriptName).fetch(c.req.raw);
  };
}
