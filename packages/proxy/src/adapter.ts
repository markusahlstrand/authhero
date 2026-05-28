import type {
  ProxyRoute,
  ProxyRoutesAdapter,
  ListProxyRoutesParams,
  ListProxyRoutesResult,
} from "@authhero/adapter-interfaces";

export type {
  ProxyRoutesAdapter,
  ListProxyRoutesParams,
  ListProxyRoutesResult,
};

export interface ResolvedHost {
  tenant_id: string;
  custom_domain_id: string;
  domain: string;
  routes: ProxyRoute[];
}

/**
 * Data adapter consumed by the proxy data plane.
 *
 * `proxyRoutes` mirrors the tenant-scoped CRUD adapter that AuthHero uses for
 * its management API. `resolveHost` is the cross-tenant lookup the proxy data
 * plane needs on every incoming request — it maps a request `Host` header to
 * the owning tenant, custom domain, and route set.
 */
export interface ProxyDataAdapter {
  proxyRoutes: ProxyRoutesAdapter;
  resolveHost(host: string): Promise<ResolvedHost | null>;
}
