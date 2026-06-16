import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import {
  AuthHeroConfig,
  DataAdapters,
  createEncryptedDataAdapter,
  createEncryptedDataAdapterWithKeyRing,
  loadEncryptionKey,
  type KeyRing,
} from "authhero";
import { withRuntimeFallback } from "@authhero/multi-tenancy";
import createApp from "./app";
import { Env } from "./types";

// The control plane tenant id whose projected defaults this tenant inherits.
// Must match the control plane Worker's CONTROL_PLANE_TENANT_ID.
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

    const config: AuthHeroConfig = {
      dataAdapter,
      allowedOrigins: [origin].filter(Boolean),
    };

    const app = createApp(config);

    return app.fetch(request, { ...env, ISSUER: issuer });
  },
};
