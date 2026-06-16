import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import {
  AuthHeroConfig,
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

    const config: AuthHeroConfig & { dataAdapter: DataAdapters } = {
      dataAdapter,
      allowedOrigins: [origin].filter(Boolean),
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
