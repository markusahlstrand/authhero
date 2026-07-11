import type { Tenant, TenantsDataAdapter } from "@authhero/adapter-interfaces";
import type { ResolvedHost } from "@authhero/proxy";
import {
  buildKvHostKey,
  DEFAULT_KV_HOST_KEY_PREFIX,
  type KvNamespaceWriter,
} from "@authhero/proxy";

/**
 * Default dispatch-namespace binding name the synthesized route targets.
 * Must match the `[[dispatch_namespaces]] binding = "..."` declared in the
 * proxy Worker's wrangler config.
 */
export const DEFAULT_WFP_DISPATCH_BINDING = "DISPATCHER";

/**
 * Default script-name template, matching the WFP provisioner's default
 * (`scriptNameTemplate` in `@authhero/cloudflare-adapter`). Only used when the
 * tenant row carries no `worker_script_name` — the provisioner writes that
 * back on provision, and it is always preferred.
 */
export const DEFAULT_WFP_SCRIPT_NAME_TEMPLATE = "{tenant_id}";

/**
 * The platform subdomain a WFP tenant is served on: `{tenant_id}.{issuerHost}`.
 * Central so the publisher, the resolver, and any reconcile host-list
 * derivation all agree on the exact host (and therefore the KV key).
 */
export function wfpTenantHost(tenantId: string, issuerHost: string): string {
  return `${tenantId}.${normalizeHost(issuerHost)}`.toLowerCase();
}

function normalizeHost(host: string): string {
  let normalized = host.trim().toLowerCase();
  const colon = normalized.indexOf(":");
  if (colon !== -1) normalized = normalized.slice(0, colon);
  if (normalized.endsWith(".")) normalized = normalized.slice(0, -1);
  return normalized;
}

export interface WfpTenantHostResolverOptions {
  /** Tenant lookup — typically the control plane's tenants adapter. */
  tenants: Pick<TenantsDataAdapter, "get">;
  /**
   * The issuer host tenant subdomains hang off (e.g. `token.example.com`,
   * from `new URL(env.ISSUER).host`). A host resolves only when it is exactly
   * one label under this — `wpf.token.example.com`, not `a.b.token.example.com`.
   */
  issuerHost: string;
  /** Dispatch-namespace binding name on the proxy Worker. */
  dispatchBinding?: string;
  /**
   * Fallback script-name template (`{tenant_id}` placeholder) for tenants
   * provisioned before `worker_script_name` was written back. Must match the
   * provisioner's template.
   */
  scriptNameTemplate?: string;
  /** Optional per-request timeout (ms) forwarded to the dispatch handler. */
  dispatchTimeoutMs?: number;
}

/**
 * Build a `resolveHost` that maps a WFP tenant's platform subdomain
 * (`{tenant_id}.{issuerHost}`) to a synthetic `ResolvedHost` whose single
 * route dispatches into the tenant's own Worker via the proxy's
 * `dispatch_namespace` handler.
 *
 * Resolves only tenants with `deployment_type: "wfp"` AND
 * `provisioning_state: "ready"` — anything else returns `null` so the host
 * falls through to the proxy's fallback chain (typically the shared control
 * plane), which keeps a tenant serviceable while it is still provisioning.
 * No `custom_domains` row is involved; the mapping is derived entirely from
 * the tenant row, which stays the durable source of truth.
 *
 * Compose it behind the custom-domains resolver with `composeHostResolvers`
 * so an explicit `custom_domains` row for the same host always wins.
 */
export function createWfpTenantHostResolver(
  options: WfpTenantHostResolverOptions,
): (host: string) => Promise<ResolvedHost | null> {
  const {
    tenants,
    dispatchBinding = DEFAULT_WFP_DISPATCH_BINDING,
    scriptNameTemplate = DEFAULT_WFP_SCRIPT_NAME_TEMPLATE,
    dispatchTimeoutMs,
  } = options;
  const issuerHost = normalizeHost(options.issuerHost);
  const suffix = `.${issuerHost}`;

  return async (rawHost: string): Promise<ResolvedHost | null> => {
    const host = normalizeHost(rawHost);
    if (!host.endsWith(suffix)) return null;

    const label = host.slice(0, -suffix.length);
    // Exactly one label under the issuer host; the bare issuer host itself
    // (empty label) is the control plane, never a tenant.
    if (!label || label.includes(".")) return null;

    const tenant = await tenants.get(label);
    if (
      !tenant ||
      tenant.deployment_type !== "wfp" ||
      tenant.provisioning_state !== "ready"
    ) {
      return null;
    }

    return buildWfpTenantResolvedHost(tenant, host, {
      dispatchBinding,
      scriptNameTemplate,
      dispatchTimeoutMs,
    });
  };
}

function buildWfpTenantResolvedHost(
  tenant: Tenant,
  host: string,
  opts: {
    dispatchBinding: string;
    scriptNameTemplate: string;
    dispatchTimeoutMs?: number;
  },
): ResolvedHost {
  const scriptName =
    tenant.worker_script_name ??
    opts.scriptNameTemplate.replaceAll("{tenant_id}", tenant.id);
  // `updated_at` transforms null → "" in the tenant schema, hence `||`.
  const timestamp = tenant.updated_at || new Date().toISOString();

  return {
    tenant_id: tenant.id,
    // No custom_domains row exists for a platform subdomain — the host doubles
    // as the synthetic id, mirroring the proxy's static adapter.
    custom_domain_id: host,
    domain: host,
    routes: [
      {
        id: `${host}:wfp-dispatch`,
        tenant_id: tenant.id,
        custom_domain_id: host,
        priority: 100,
        match: { path: "/*" },
        handlers: [
          { type: "forwarded_headers", options: {} },
          {
            type: "dispatch_namespace",
            options: {
              binding: opts.dispatchBinding,
              script_name: scriptName,
              ...(opts.dispatchTimeoutMs
                ? { timeout_ms: opts.dispatchTimeoutMs }
                : {}),
            },
          },
        ],
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
  };
}

/**
 * Chain host resolvers: first non-null wins, in argument order. Put the
 * custom-domains resolver first so an explicit `custom_domains` row overrides
 * a derived WFP tenant-subdomain route for the same host. Errors propagate —
 * a failing layer should surface (and let the caller's own fallback take
 * over), not be silently treated as a miss that could delete a live KV key.
 */
export function composeHostResolvers(
  ...resolvers: Array<(host: string) => Promise<ResolvedHost | null>>
): (host: string) => Promise<ResolvedHost | null> {
  return async (host) => {
    for (const resolve of resolvers) {
      const hit = await resolve(host);
      if (hit) return hit;
    }
    return null;
  };
}

export interface WfpTenantsKvPublishOptions {
  /** Tenants adapter whose writes should be mirrored to KV. */
  tenants: TenantsDataAdapter;
  /** KV namespace the resolved host blobs are published to. */
  kv: KvNamespaceWriter;
  /**
   * Cross-tenant host resolver used to recompute the blob after a write —
   * pass the SAME composed resolver (custom domains first, then
   * `createWfpTenantHostResolver`) that the control plane serves over HTTP,
   * so every publisher computes identical blobs for a host.
   */
  resolveHost: (host: string) => Promise<ResolvedHost | null>;
  /** The issuer host tenant subdomains hang off — see `wfpTenantHost`. */
  issuerHost: string;
  /** Key prefix; must match the proxy reader. Defaults to the shared default. */
  keyPrefix?: string;
  /**
   * Optional `ctx.waitUntil` so the fire-and-forget KV publish runs to
   * completion without blocking (or failing) the originating write. When
   * omitted, the publish is detached with its rejection swallowed.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
  /** Optional hook invoked when a publish fails. */
  onError?: (err: unknown, ctx: { host: string; op: string }) => void;
}

/**
 * Wrap a control plane's `tenants` adapter so every WFP-tenant mutation
 * republishes (or deletes) the tenant's platform-subdomain routing blob in KV
 * — the tenants-table counterpart of `wrapProxyAdaptersWithKvPublish`.
 *
 * This is the single choke-point for WFP subdomain routing: the provisioner
 * flips `provisioning_state` to `"ready"` through `tenants.update`, which
 * publishes the dispatch route the moment the tenant Worker is servable —
 * inline hook and durable-workflow paths alike, with no per-path wiring. A
 * remove deletes the key, so a deprovisioned tenant's host falls back to the
 * proxy's default chain instead of dispatching to a dead script.
 *
 * Shared (non-WFP) tenants never touch KV. Publishing is fire-and-forget;
 * silent drift is corrected by the periodic reconcile
 * (`backfillProxyHostsToKv` over `wfpTenantHost`-derived hosts).
 */
export function wrapTenantsAdapterWithWfpKvPublish(
  options: WfpTenantsKvPublishOptions,
): TenantsDataAdapter {
  const {
    tenants,
    kv,
    resolveHost,
    issuerHost,
    keyPrefix = DEFAULT_KV_HOST_KEY_PREFIX,
    waitUntil,
    onError,
  } = options;

  function schedule(promise: Promise<unknown>): void {
    const safe = promise.catch(() => undefined);
    if (waitUntil) waitUntil(safe);
  }

  // Recompute the host blob and republish (put), or delete when it no longer
  // resolves. Always resolves — failures route to `onError`, never throw.
  async function publishHost(host: string, op: string): Promise<void> {
    try {
      const blob = await resolveHost(host);
      const key = buildKvHostKey(keyPrefix, host);
      if (blob) {
        await kv.put(key, JSON.stringify(blob));
      } else {
        await kv.delete(key);
      }
    } catch (err) {
      if (onError) onError(err, { host, op });
    }
  }

  function publish(tenantId: string, op: string): void {
    schedule(publishHost(wfpTenantHost(tenantId, issuerHost), op));
  }

  // Row reads for publish gating must never fail (or delay a false failure
  // onto) the underlying write — degrade to "not wfp", which skips the
  // publish; the periodic reconcile repairs the drift.
  async function isWfp(id: string): Promise<boolean> {
    try {
      const tenant = await tenants.get(id);
      return tenant?.deployment_type === "wfp";
    } catch {
      return false;
    }
  }

  return {
    ...tenants,
    async create(params, createOptions) {
      const created = await tenants.create(params, createOptions);
      if (created.deployment_type === "wfp") {
        publish(created.id, "tenant.create");
      }
      return created;
    },
    async update(id, patch) {
      await tenants.update(id, patch);
      // `deployment_type` in the patch also covers a wfp → shared flip, where
      // the post-update row is no longer wfp but the stale key must go.
      if ("deployment_type" in patch || (await isWfp(id))) {
        publish(id, "tenant.update");
      }
    },
    async remove(id) {
      const wasWfp = await isWfp(id);
      const ok = await tenants.remove(id);
      // The row is gone, so the blob recomputes to null → KV key deleted.
      if (ok && wasWfp) publish(id, "tenant.remove");
      return ok;
    },
  };
}
