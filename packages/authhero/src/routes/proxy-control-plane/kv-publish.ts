import type {
  CustomDomainsAdapter,
  ProxyRoutesAdapter,
} from "@authhero/adapter-interfaces";
import type { ResolvedHost } from "@authhero/proxy";
import {
  buildKvHostKey,
  DEFAULT_KV_HOST_KEY_PREFIX,
  type KvNamespaceWriter,
} from "@authhero/proxy";

export interface KvPublishOptions {
  /** Custom-domains adapter whose writes should be mirrored to KV. */
  customDomains: CustomDomainsAdapter;
  /** Proxy-routes adapter whose writes should be mirrored to KV. */
  proxyRoutes: ProxyRoutesAdapter;
  /** KV namespace the resolved host blobs are published to. */
  kv: KvNamespaceWriter;
  /**
   * Cross-tenant host resolver — the same function passed to
   * `createProxyControlPlaneApp`. Used to recompute the full `ResolvedHost`
   * blob for a host after any write.
   */
  resolveHost: (host: string) => Promise<ResolvedHost | null>;
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

export interface WrappedProxyAdapters {
  customDomains: CustomDomainsAdapter;
  proxyRoutes: ProxyRoutesAdapter;
}

/**
 * Wrap a control plane's `customDomains` + `proxyRoutes` adapters so every
 * mutation recomputes the affected host's full `ResolvedHost` blob and
 * publishes it to a Cloudflare KV namespace (fire-and-forget). The proxy reads
 * that blob via `createKvProxyAdapter` instead of the two-hop HTTP control
 * plane.
 *
 * The wrapped pair is the single choke-point: pass it to BOTH the management-api
 * app (direct control-plane writes) AND `createApplySyncEvents` (WFP
 * `/sync`-applied writes) so KV stays in sync regardless of write origin.
 *
 * Publishing never blocks or fails the underlying write — a dropped `KV.put`
 * causes at-most transient drift, mitigated by the proxy's HTTP fallback on KV
 * miss and a periodic reconcile (`backfillProxyHostsToKv`).
 */
export function wrapProxyAdaptersWithKvPublish(
  options: KvPublishOptions,
): WrappedProxyAdapters {
  const {
    customDomains,
    proxyRoutes,
    kv,
    resolveHost,
    keyPrefix = DEFAULT_KV_HOST_KEY_PREFIX,
    waitUntil,
    onError,
  } = options;

  function schedule(promise: Promise<unknown>): void {
    const safe = promise.catch(() => undefined);
    if (waitUntil) waitUntil(safe);
  }

  // Recompute the whole host blob and republish (or delete on null). Always
  // resolves — failures are routed to `onError`, never thrown.
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

  function publish(host: string | undefined | null, op: string): void {
    if (!host) return;
    schedule(publishHost(host, op));
  }

  async function hostForCustomDomainId(
    tenant_id: string,
    custom_domain_id: string,
  ): Promise<string | null> {
    const domain = await customDomains.get(tenant_id, custom_domain_id);
    return domain?.domain ?? null;
  }

  const wrappedCustomDomains: CustomDomainsAdapter = {
    ...customDomains,
    async create(tenant_id, custom_domain, createOptions) {
      const created = await customDomains.create(
        tenant_id,
        custom_domain,
        createOptions,
      );
      publish(created.domain, "custom_domain.create");
      return created;
    },
    async update(tenant_id, id, custom_domain) {
      const before = await customDomains.get(tenant_id, id);
      const ok = await customDomains.update(tenant_id, id, custom_domain);
      if (ok) {
        const after = await customDomains.get(tenant_id, id);
        const host = after?.domain ?? before?.domain;
        // A domain rename leaves a stale key under the old host — drop it.
        if (before?.domain && after?.domain && before.domain !== after.domain) {
          publish(before.domain, "custom_domain.update");
        }
        publish(host, "custom_domain.update");
      }
      return ok;
    },
    async remove(tenant_id, id) {
      const before = await customDomains.get(tenant_id, id);
      const ok = await customDomains.remove(tenant_id, id);
      if (ok) publish(before?.domain, "custom_domain.remove");
      return ok;
    },
  };

  if (customDomains.uploadCertificate) {
    const uploadCertificate = customDomains.uploadCertificate.bind(
      customDomains,
    );
    wrappedCustomDomains.uploadCertificate = async (tenant_id, id, cert) => {
      const result = await uploadCertificate(tenant_id, id, cert);
      publish(result.domain, "custom_domain.uploadCertificate");
      return result;
    };
  }

  const wrappedProxyRoutes: ProxyRoutesAdapter = {
    ...proxyRoutes,
    async create(tenant_id, route, createOptions) {
      const created = await proxyRoutes.create(tenant_id, route, createOptions);
      const host = await hostForCustomDomainId(
        tenant_id,
        created.custom_domain_id,
      );
      publish(host, "proxy_route.create");
      return created;
    },
    async update(tenant_id, id, route) {
      // `custom_domain_id` is immutable on update, so reading it before the
      // write is sufficient to locate the affected host.
      const existing = await proxyRoutes.get(tenant_id, id);
      const ok = await proxyRoutes.update(tenant_id, id, route);
      if (ok && existing) {
        const host = await hostForCustomDomainId(
          tenant_id,
          existing.custom_domain_id,
        );
        publish(host, "proxy_route.update");
      }
      return ok;
    },
    async remove(tenant_id, id) {
      const existing = await proxyRoutes.get(tenant_id, id);
      const ok = await proxyRoutes.remove(tenant_id, id);
      if (ok && existing) {
        const host = await hostForCustomDomainId(
          tenant_id,
          existing.custom_domain_id,
        );
        publish(host, "proxy_route.remove");
      }
      return ok;
    },
  };

  return {
    customDomains: wrappedCustomDomains,
    proxyRoutes: wrappedProxyRoutes,
  };
}

export interface BackfillProxyHostsOptions {
  /**
   * Hosts to (re)publish. The adapter interface exposes no cross-tenant domain
   * list, so the caller supplies these — typically from a direct DB query over
   * all custom domains.
   */
  hosts: string[];
  /** Cross-tenant host resolver (same as `createProxyControlPlaneApp`). */
  resolveHost: (host: string) => Promise<ResolvedHost | null>;
  /** KV namespace to publish into. */
  kv: KvNamespaceWriter;
  /** Key prefix; must match the proxy reader. Defaults to the shared default. */
  keyPrefix?: string;
}

export interface BackfillResult {
  published: number;
  deleted: number;
  failed: string[];
}

/**
 * Publish (or delete, for hosts that no longer resolve) the resolved blob for
 * each supplied host into KV. Used for the one-time migration backfill and as
 * the primitive a periodic reconcile cron calls to correct silent drift.
 */
export async function backfillProxyHostsToKv(
  options: BackfillProxyHostsOptions,
): Promise<BackfillResult> {
  const {
    hosts,
    resolveHost,
    kv,
    keyPrefix = DEFAULT_KV_HOST_KEY_PREFIX,
  } = options;

  const result: BackfillResult = { published: 0, deleted: 0, failed: [] };

  for (const host of hosts) {
    try {
      const blob = await resolveHost(host);
      const key = buildKvHostKey(keyPrefix, host);
      if (blob) {
        await kv.put(key, JSON.stringify(blob));
        result.published += 1;
      } else {
        await kv.delete(key);
        result.deleted += 1;
      }
    } catch {
      result.failed.push(host);
    }
  }

  return result;
}
