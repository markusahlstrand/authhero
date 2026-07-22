import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import { HTTPException } from "hono/http-exception";
import {
  AuthHeroConfig,
  CustomDomainsAdapter,
  DataAdapters,
  createControlPlaneClient,
  createControlPlaneCustomDomainsAdapter,
  createEncryptedDataAdapter,
  createEncryptedDataAdapterWithKeyRing,
  createServiceBindingFetch,
  createServiceTokenCore,
  loadEncryptionKey,
  type KeyRing,
} from "authhero";
import { withRuntimeFallback } from "@authhero/multi-tenancy";
import createApp from "./app";
import { Env } from "./types";

// The control plane tenant id whose projected defaults this tenant inherits.
// Must match the control plane Worker's CONTROL_PLANE_TENANT_ID.
const CONTROL_PLANE_TENANT_ID = "control_plane";

// ──────────────────────────────────────────────────────────────────────────────
// Data retention: no cron here — this is deliberate.
//
// This Worker is uploaded to a Workers-for-Platforms dispatch namespace and is
// only ever invoked via `env.DISPATCHER.get(name).fetch()`. Dispatch-namespace
// Workers do NOT receive `scheduled` events, so a `[triggers] crons` block here
// would never fire. Its D1 (codes, outbox_events, expired sessions) must instead
// be swept centrally: iterate tenants from the control plane and call
// `runRetention({ dataAdapter, tenantId })` against each tenant's own database.
// See https://authhero.net/deployment/data-retention.
// ──────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const issuer = `${url.protocol}//${url.host}/`;
    const origin = request.headers.get("Origin") || "";

    const db = drizzle(env.AUTH_DB, { schema });
    let dataAdapter: DataAdapters = createAdapters(db, {
      useTransactions: false,
    });

    // Encrypt at rest. With both keys present, this tenant's own secrets use
    // ENCRYPTION_KEY while control-plane-tenant rows (the inherited Google
    // secret, etc.) use the "cp" key id — readable by this Worker, but opaque
    // in a raw export of AUTH_DB.
    if (env.ENCRYPTION_KEY && env.CONTROL_PLANE_ENCRYPTION_KEY) {
      const ring: KeyRing = {
        default: await loadEncryptionKey(env.ENCRYPTION_KEY),
        keys: { cp: await loadEncryptionKey(env.CONTROL_PLANE_ENCRYPTION_KEY) },
      };
      dataAdapter = createEncryptedDataAdapterWithKeyRing(dataAdapter, ring, {
        resolveEncryptKeyId: (tenantId) =>
          tenantId === CONTROL_PLANE_TENANT_ID ? "cp" : undefined,
      });
    } else if (env.ENCRYPTION_KEY) {
      // Single-key fallback (no inherited control-plane secrets).
      dataAdapter = createEncryptedDataAdapter(
        dataAdapter,
        await loadEncryptionKey(env.ENCRYPTION_KEY),
      );
    }

    // Resolve inherited defaults (connections by strategy, is_system resource
    // servers, inheritable hooks, email provider) from the control-plane rows
    // the rollout projected into THIS tenant's database — identical read path
    // to a control-plane-colocated tenant.
    dataAdapter = withRuntimeFallback(dataAdapter, {
      controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
    });

    // Custom domains are the one entity this Worker cannot own. Registering a
    // CF-for-SaaS hostname needs account credentials that only the control
    // plane holds, and "login.acme.com belongs to exactly one tenant" can only
    // be enforced above the shards. So writes go to the control plane
    // synchronously and the result is mirrored into this tenant's D1, which
    // stays the read cache that host resolution uses.
    if (env.CONTROL_PLANE_URL) {
      const shard = dataAdapter;
      const client = createControlPlaneClient({
        baseUrl: env.CONTROL_PLANE_URL,
        // Prefer the service binding: this Worker runs inside the dispatch
        // namespace, so a public-edge call to the control plane would leave
        // Cloudflare and come back in through the proxy that dispatched us.
        // The binding keeps the hop internal (and cannot loop back into the
        // proxy regardless of what CONTROL_PLANE_URL points at). Without the
        // binding we fall back to the public edge, which still works.
        fetchImpl: env.CONTROL_PLANE
          ? createServiceBindingFetch(env.CONTROL_PLANE)
          : undefined,
        getServiceToken: async (tenantId, scope) => {
          const token = await createServiceTokenCore({
            tenants: shard.tenants,
            keys: shard.keys,
            tenantId,
            scope,
            issuer,
          });
          return token.access_token;
        },
      });

      dataAdapter = {
        ...shard,
        customDomains: createControlPlaneCustomDomainsAdapter({
          client,
          mirror: shard.customDomains,
        }),
      };
    } else {
      // Fail closed. Writing to the local table would "succeed" while the
      // hostname is registered nowhere and its uniqueness is unchecked — the
      // exact silent breakage this indirection exists to prevent. Reads still
      // work, so any domain already mirrored here keeps resolving.
      dataAdapter = {
        ...dataAdapter,
        customDomains: readOnlyCustomDomains(dataAdapter.customDomains),
      };
    }

    const config: AuthHeroConfig = {
      dataAdapter,
      allowedOrigins: [origin].filter(Boolean),
    };

    const app = createApp(config);

    return app.fetch(request, { ...env, ISSUER: issuer });
  },
};

/**
 * Custom-domain reads pass through; every write is refused. A tenant Worker
 * cannot register a Cloudflare hostname or check that nobody else claimed it,
 * so a "successful" local write would produce a domain that never routes.
 * Set CONTROL_PLANE_URL to enable writes.
 */
function readOnlyCustomDomains(mirror: CustomDomainsAdapter) {
  const unconfigured = (): never => {
    throw new HTTPException(501, {
      message:
        "Custom domains are managed by the control plane: set CONTROL_PLANE_URL on this tenant Worker to create, update or delete them.",
    });
  };

  return {
    ...mirror,
    create: unconfigured,
    update: unconfigured,
    remove: unconfigured,
    uploadCertificate: unconfigured,
  };
}
