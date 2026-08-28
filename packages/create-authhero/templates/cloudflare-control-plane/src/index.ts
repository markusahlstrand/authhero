import { drizzle } from "drizzle-orm/d1";
import createAdapters, { createProxyDataAdapter } from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import createCloudflareAdapters, {
  syncCustomDomains,
  type CloudflareConfig,
} from "@authhero/cloudflare-adapter";
import {
  AuthHeroConfig,
  CustomDomainsAdapter,
  DataAdapters,
  createEncryptedDataAdapter,
  loadEncryptionKey,
  runRetention,
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

    const { db, dataAdapter: baseAdapter } = await buildDataAdapter(env);
    let dataAdapter = baseAdapter;

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
    const cloudflareConfig = buildCloudflareConfig(env, dataAdapter);
    const customDomains: CustomDomainsAdapter | undefined = cloudflareConfig
      ? createCloudflareAdapters(cloudflareConfig).customDomains
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

  // ────────────────────────────────────────────────────────────────────────
  // Retention sweep (this Worker's own D1)
  // ────────────────────────────────────────────────────────────────────────
  // Two jobs share this handler, dispatched on which cron fired:
  //
  //   */5 * * * *  custom domain sync — reconciles every hostname in the
  //                Cloudflare zone against the stored rows. Without it a
  //                domain that finishes validation at the edge stays `pending`
  //                here until somebody opens its detail page, because `list`
  //                and the routing path deliberately never call Cloudflare.
  //   0 3 * * *    retention — prunes expired `codes`, processed
  //                `outbox_events` and expired sessions in the control plane's
  //                own database, which otherwise grows without bound.
  //
  // NOTE: this sweeps only AUTH_DB (the control_plane tenant). Each WFP tenant
  // has its OWN D1 and its tenant Worker cannot carry a cron (dispatch-namespace
  // Workers don't receive scheduled events), so tenant shards must be swept
  // centrally — call `runRetention({ dataAdapter, tenantId })` per tenant using
  // `buildTenantAdapters(env, tenantId)` below. That cross-tenant driver is not
  // wired here yet; see https://authhero.net/deployment/data-retention.
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const { dataAdapter } = await buildDataAdapter(env);

    // An unrecognised cron runs everything, so a hand-triggered
    // `wrangler dev --test-scheduled` (which reports the first cron) still
    // exercises both jobs.
    const recognised =
      event.cron === CUSTOM_DOMAIN_SYNC_CRON || event.cron === RETENTION_CRON;

    if (event.cron === CUSTOM_DOMAIN_SYNC_CRON || !recognised) {
      const cloudflareConfig = buildCloudflareConfig(env, dataAdapter);
      if (cloudflareConfig) {
        console.log(
          "custom domain sync",
          await syncCustomDomains(cloudflareConfig),
        );
      }
    }

    if (event.cron === RETENTION_CRON || !recognised) {
      const { sweeps } = await runRetention({ dataAdapter });
      console.log("retention sweep", sweeps);
    }
  },
};

/**
 * The cron expressions from wrangler.toml. Keep the two files in step: an
 * unrecognised cron falls through to running every job, which is safe but
 * makes the daily retention pass run on the five-minute schedule.
 */
const CUSTOM_DOMAIN_SYNC_CRON = "*/5 * * * *";
const RETENTION_CRON = "0 3 * * *";

/**
 * Cloudflare zone credentials, or `undefined` when custom domains are not
 * configured. Shared by the request path and the sync cron so both address the
 * same zone through the same database adapter.
 */
function buildCloudflareConfig(
  env: Env,
  dataAdapter: DataAdapters,
): CloudflareConfig | undefined {
  if (
    !env.CLOUDFLARE_ZONE_ID ||
    !env.CLOUDFLARE_API_KEY ||
    !env.CLOUDFLARE_API_EMAIL
  ) {
    return undefined;
  }

  return {
    zoneId: env.CLOUDFLARE_ZONE_ID,
    authKey: env.CLOUDFLARE_API_KEY,
    authEmail: env.CLOUDFLARE_API_EMAIL,
    // The Cloudflare adapter performs the zone-level side effect and persists
    // the row through this database adapter.
    customDomainAdapter: dataAdapter.customDomains,
  };
}

/**
 * Build the base DataAdapters over the control plane's own D1 (AUTH_DB),
 * wrapped with encryption when ENCRYPTION_KEY is set. Shared by the request
 * path and the retention cron so both see the same schema, transaction and
 * encryption configuration. The fetch handler decorates the returned adapter
 * with custom-domains support after this base is built.
 */
async function buildDataAdapter(env: Env) {
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
  return { db, dataAdapter };
}

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
