import {
  CacheAdapter,
  Client,
  Connection,
  ClientWithTenantId,
  DataAdapters,
  ListConnectionsResponse,
  ListResourceServersResponse,
  ListHooksResponse,
  Branding,
  PromptSetting,
  Tenant,
  Theme,
} from "@authhero/adapter-interfaces";

/**
 * One snapshot of every per-(tenant, client) read that the request path
 * touches outside of user-specific data. Loaded once per request and held
 * in a 5-minute SWR cache.
 *
 * Tenant-scoped lists (connections, resourceServers, hooks) are stored as
 * their full default-list response so callers calling list(tenant_id) with
 * no params get an identical shape from the bundle.
 */
export interface ClientBundle {
  tenant: Tenant | null;
  client: Client | null;
  connections: ListConnectionsResponse;
  clientConnections: Connection[];
  branding: Branding | null;
  resourceServers: ListResourceServersResponse;
  promptSettings: PromptSetting | null;
  hooks: ListHooksResponse;
  /** The tenant's default theme. Universal-login routes always fetch this
   * one ("default") key, so bundling it saves a round-trip on every UI
   * render. Non-UI routes get the field for free; the payload is small.
   */
  defaultTheme: Theme | null;
}

interface BundleEntry {
  value: ClientBundle;
  freshUntil: number;
  staleUntil: number;
}

export interface ClientBundleConfig {
  /** Seconds the bundle is served without a refresh. Default 300. */
  freshSeconds?: number;
  /** Seconds the bundle may be served stale while a background refresh runs. Default 600 (so total lifetime = fresh + stale). */
  staleSeconds?: number;
  /** Cache key prefix (per-deployment isolation). Default "client-bundle". */
  keyPrefix?: string;
}

const DEFAULTS: Required<ClientBundleConfig> = {
  freshSeconds: 300,
  staleSeconds: 600,
  keyPrefix: "client-bundle",
};

export function clientBundleKey(
  tenantId: string,
  clientId: string,
  prefix: string = DEFAULTS.keyPrefix,
): string {
  return `${prefix}:${tenantId}:${clientId}`;
}

/**
 * Entity names covered by the {@link ClientBundle}. Single source of truth
 * used by {@link composeAuthData} so individual apps don't need to enumerate
 * the bundled entities themselves — they only declare their long-tail
 * (non-bundle) entities.
 *
 * Keep in sync with {@link fetchBundle} above.
 */
export const BUNDLE_ENTITIES = [
  "tenants",
  "clients",
  "connections",
  "clientConnections",
  "branding",
  "resourceServers",
  "promptSettings",
  "hooks",
  "themes",
] as const;

async function fetchBundle(
  data: DataAdapters,
  tenantId: string,
  clientId: string,
): Promise<ClientBundle> {
  const [
    tenant,
    client,
    connections,
    clientConnections,
    branding,
    resourceServers,
    promptSettings,
    hooks,
    defaultTheme,
  ] = await Promise.all([
    data.tenants.get(tenantId),
    data.clients.get(tenantId, clientId),
    data.connections.list(tenantId),
    data.clientConnections.listByClient(tenantId, clientId),
    data.branding.get(tenantId),
    data.resourceServers.list(tenantId),
    data.promptSettings.get(tenantId).catch(() => null),
    data.hooks.list(tenantId),
    data.themes.get(tenantId, "default"),
  ]);

  return {
    tenant,
    client,
    connections,
    clientConnections,
    branding,
    resourceServers,
    promptSettings,
    hooks,
    defaultTheme,
  };
}

/**
 * Look up — and on miss, populate — the per-(tenant, client) bundle.
 *
 * SWR semantics:
 * - now < freshUntil → return immediately
 * - freshUntil ≤ now < staleUntil → return immediately, schedule a refresh
 *   via `scheduleRefresh` (typically wired to `ctx.executionCtx.waitUntil`)
 * - now ≥ staleUntil OR no entry → fetch synchronously
 *
 * `data` should be the underlying adapter (i.e. with hooks but without the
 * bundle wrapper). Passing the bundle-wrapped adapter would deadlock on
 * itself, since bundle reads route back into this function.
 */
export async function loadClientBundle(
  data: DataAdapters,
  cache: CacheAdapter,
  tenantId: string,
  clientId: string,
  options: {
    config?: ClientBundleConfig;
    /** Schedule a background promise. Provide `ctx.executionCtx.waitUntil.bind(ctx.executionCtx)` on Workers; otherwise omit and we'll skip the background refresh. */
    scheduleRefresh?: (promise: Promise<unknown>) => void;
    /** Override the "now" clock for testing. */
    now?: () => number;
  } = {},
): Promise<ClientBundle> {
  const cfg = { ...DEFAULTS, ...(options.config ?? {}) };
  const now = options.now ?? Date.now;
  const key = clientBundleKey(tenantId, clientId, cfg.keyPrefix);

  const entry = await cache.get<BundleEntry>(key);
  const t = now();

  if (entry && t < entry.freshUntil) {
    return entry.value;
  }

  if (entry && t < entry.staleUntil && options.scheduleRefresh) {
    // Serve stale; refresh in background. Swallow refresh errors so a
    // transient DB failure during refresh doesn't surface to the caller.
    options.scheduleRefresh(
      refreshBundle(data, cache, tenantId, clientId, cfg, now).catch(
        () => undefined,
      ),
    );
    return entry.value;
  }

  return refreshBundle(data, cache, tenantId, clientId, cfg, now);
}

async function refreshBundle(
  data: DataAdapters,
  cache: CacheAdapter,
  tenantId: string,
  clientId: string,
  cfg: Required<ClientBundleConfig>,
  now: () => number,
): Promise<ClientBundle> {
  const value = await fetchBundle(data, tenantId, clientId);
  const t = now();
  const entry: BundleEntry = {
    value,
    freshUntil: t + cfg.freshSeconds * 1000,
    staleUntil: t + (cfg.freshSeconds + cfg.staleSeconds) * 1000,
  };
  // Keep entry alive for the full fresh+stale window.
  await cache.set(key(tenantId, clientId, cfg.keyPrefix), entry, cfg.freshSeconds + cfg.staleSeconds);
  return value;
}

function key(tenantId: string, clientId: string, prefix: string): string {
  return clientBundleKey(tenantId, clientId, prefix);
}

/** Helper to extract the ClientWithTenantId shape from a bundle. */
export function bundleToClientWithTenantId(
  bundle: ClientBundle,
  tenantId: string,
): ClientWithTenantId | null {
  if (!bundle.client) return null;
  return { ...bundle.client, tenant_id: tenantId };
}
