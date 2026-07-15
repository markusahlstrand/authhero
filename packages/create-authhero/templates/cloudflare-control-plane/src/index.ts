import { drizzle } from "drizzle-orm/d1";
import createAdapters, { createProxyDataAdapter } from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import createCloudflareAdapters from "@authhero/cloudflare-adapter";
import {
  AuthHeroConfig,
  CustomDomainsAdapter,
  DataAdapters,
  createEncryptedDataAdapter,
  loadEncryptionKey,
} from "authhero";
import { createDirectRolloutAdapter } from "@authhero/multi-tenancy";
import createApp from "./app";
import { Env } from "./types";

const CONTROL_PLANE_TENANT_ID = "control_plane";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const issuer = `${url.protocol}//${url.host}/`;
    const origin = request.headers.get("Origin") || "";

    const db = drizzle(env.AUTH_DB, { schema });
    let dataAdapter: DataAdapters = createAdapters(db, {
      useTransactions: false,
    });

    if (env.ENCRYPTION_KEY) {
      dataAdapter = createEncryptedDataAdapter(
        dataAdapter,
        await loadEncryptionKey(env.ENCRYPTION_KEY),
      );
    }

    // Rollout source: project the control plane's inheritable defaults into a
    // WFP tenant's own database. Runs inline here; swap for a Cloudflare
    // Workflows implementation of ControlPlaneRolloutAdapter when you outgrow it.
    const rollout = createDirectRolloutAdapter({
      controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
      getControlPlaneAdapters: async () => dataAdapter,
      getAdapters: (tenantId) => buildTenantAdapters(env, tenantId),
    });

    // The control plane is authoritative for custom domains: it is the only
    // place that holds Cloudflare account credentials (so it can register the
    // custom hostname) and the only place that can see every tenant's domains
    // (so a hostname is claimed exactly once). Tenant shards reach this
    // through `createControlPlaneCustomDomainsAdapter`.
    const customDomains: CustomDomainsAdapter | undefined =
      env.CLOUDFLARE_ZONE_ID &&
      env.CLOUDFLARE_API_KEY &&
      env.CLOUDFLARE_API_EMAIL
        ? createCloudflareAdapters({
            zoneId: env.CLOUDFLARE_ZONE_ID,
            authKey: env.CLOUDFLARE_API_KEY,
            authEmail: env.CLOUDFLARE_API_EMAIL,
            // The Cloudflare adapter performs the zone-level side effect and
            // persists the row through this database adapter.
            customDomainAdapter: dataAdapter.customDomains,
          }).customDomains
        : undefined;

    if (customDomains) {
      // The same adapter serves both writers, so neither can create a domain
      // that Cloudflare never hears about: colocated tenants writing through
      // this instance's management API, and WFP tenants writing through the
      // /custom-domains resource below.
      dataAdapter = { ...dataAdapter, customDomains };
    }

    const config: AuthHeroConfig & { dataAdapter: DataAdapters } = {
      dataAdapter,
      allowedOrigins: [origin].filter(Boolean),
      proxyControlPlane: {
        resolveHost: createProxyDataAdapter(db).resolveHost,
        customDomains,
      },
    };

    const app = createApp(config, rollout);

    return app.fetch(request, { ...env, ISSUER: issuer });
  },
};

/**
 * Return the DataAdapters over the given tenant's OWN D1, wrapped with the same
 * control-plane key ring the tenant Worker uses (see the cloudflare-wfp-tenant
 * template), so projected secrets are re-encrypted under the "cp" key id.
 *
 * How you reach a tenant's D1 is platform-specific — a per-tenant binding, or
 * the Cloudflare D1 HTTP API. Implement this before calling sync-defaults; until
 * then the /internal sync endpoint returns 501 with this message.
 */
function buildTenantAdapters(
  _env: Env,
  _tenantId: string,
): Promise<DataAdapters> {
  throw new Error(
    "buildTenantAdapters is not configured: return the DataAdapters over the " +
      "tenant's own D1, wrapped with the control-plane key ring (default key + " +
      "{ cp: CONTROL_PLANE_ENCRYPTION_KEY }).",
  );
}
