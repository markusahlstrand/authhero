import {
  ProxyDataAdapter,
  ProxyRoutesAdapter,
  ResolvedHost,
} from "../adapter";
import {
  HandlerConfig,
  ProxyRoute,
  ProxyRouteInsert,
  RouteMatch,
} from "../types";

export interface StaticRouteInput {
  id?: string;
  priority?: number;
  match: RouteMatch;
  handlers: HandlerConfig[];
  created_at?: string;
  updated_at?: string;
}

export interface StaticHostConfig {
  tenant_id?: string;
  custom_domain_id?: string;
  routes: StaticRouteInput[];
}

export interface StaticProxyAdapterOptions {
  hosts: Record<string, StaticHostConfig | StaticRouteInput[]>;
  defaultTenantId?: string;
}

function readOnly(): never {
  throw new Error(
    "Static proxy adapter is read-only; configure routes at init time",
  );
}

function normalizeRoute(
  input: StaticRouteInput,
  index: number,
  host: string,
  tenant_id: string,
  custom_domain_id: string,
  timestamp: string,
): ProxyRoute {
  return {
    id: input.id ?? `${host}:${index}`,
    tenant_id,
    custom_domain_id,
    priority: input.priority ?? 100,
    match: { ...input.match, path: input.match.path || "/*" },
    handlers: input.handlers,
    created_at: input.created_at ?? timestamp,
    updated_at: input.updated_at ?? timestamp,
  };
}

export function createStaticProxyAdapter(
  options: StaticProxyAdapterOptions,
): ProxyDataAdapter {
  const timestamp = new Date().toISOString();
  const defaultTenant = options.defaultTenantId ?? "static";
  const resolved = new Map<string, ResolvedHost>();

  for (const [host, value] of Object.entries(options.hosts)) {
    const normalizedHost = host.toLowerCase();
    const config: StaticHostConfig = Array.isArray(value)
      ? { routes: value }
      : value;
    const tenant_id = config.tenant_id ?? defaultTenant;
    const custom_domain_id = config.custom_domain_id ?? normalizedHost;
    const routes = config.routes
      .map((r, i) =>
        normalizeRoute(
          r,
          i,
          normalizedHost,
          tenant_id,
          custom_domain_id,
          timestamp,
        ),
      )
      .sort((a, b) => a.priority - b.priority);
    resolved.set(normalizedHost, {
      tenant_id,
      custom_domain_id,
      domain: normalizedHost,
      routes,
    });
  }

  const proxyRoutes: ProxyRoutesAdapter = {
    async create() {
      return readOnly();
    },
    async update() {
      return readOnly();
    },
    async remove() {
      return readOnly();
    },
    async get(tenant_id, id) {
      for (const entry of resolved.values()) {
        if (entry.tenant_id !== tenant_id) continue;
        const found = entry.routes.find((r) => r.id === id);
        if (found) return found;
      }
      return null;
    },
    async list(tenant_id, params) {
      const all: ProxyRoute[] = [];
      for (const entry of resolved.values()) {
        if (entry.tenant_id !== tenant_id) continue;
        if (
          params?.custom_domain_id &&
          entry.custom_domain_id !== params.custom_domain_id
        ) {
          continue;
        }
        all.push(...entry.routes);
      }
      const perPage = params?.per_page ?? all.length;
      const page = params?.page ?? 0;
      const start = page * perPage;
      const slice = all.slice(start, start + perPage);
      return {
        proxy_routes: slice,
        start,
        limit: perPage,
        length: slice.length,
      };
    },
  };

  return {
    proxyRoutes,
    async resolveHost(host) {
      return resolved.get(host.toLowerCase()) ?? null;
    },
  };
}

/**
 * Sugar for building a single HTTP-forwarding route in static configs.
 * Equivalent to `{ match: { path: "/*" }, handlers: [{ type: "http", options: { upstream_url, preserve_host } }] }`.
 */
export function httpRoute(
  upstream_url: string,
  options: { path?: string; preserve_host?: boolean; priority?: number } = {},
): StaticRouteInput {
  return {
    priority: options.priority,
    match: { path: options.path ?? "/*" },
    handlers: [
      {
        type: "http",
        options: {
          upstream_url,
          preserve_host: options.preserve_host ?? false,
        },
      },
    ],
  };
}

export type { ProxyRouteInsert };
