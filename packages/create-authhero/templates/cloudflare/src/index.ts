import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import createApp from "./app";
import { Env } from "./types";
import {
  AuthHeroConfig,
  createEncryptedDataAdapter,
  loadEncryptionKey,
} from "authhero";

// ──────────────────────────────────────────────────────────────────────────────
// OPTIONAL: Uncomment to enable Cloudflare adapters (Analytics Engine, etc.)
// ──────────────────────────────────────────────────────────────────────────────
// import createCloudflareAdapters from "@authhero/cloudflare-adapter";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const issuer = `${url.protocol}//${url.host}/`;

    // Get the origin from the request for dynamic CORS
    const origin = request.headers.get("Origin") || "";

    const db = drizzle(env.AUTH_DB, { schema });
    let dataAdapter = createAdapters(db, { useTransactions: false });

    // Encrypt sensitive credential fields at rest when ENCRYPTION_KEY is set.
    // In local dev it comes from .dev.vars; in production set it with
    // `wrangler secret put ENCRYPTION_KEY`. Without it, behavior is unchanged.
    if (env.ENCRYPTION_KEY) {
      const encryptionKey = await loadEncryptionKey(env.ENCRYPTION_KEY);
      dataAdapter = createEncryptedDataAdapter(dataAdapter, encryptionKey);
    }

    // ────────────────────────────────────────────────────────────────────────
    // OPTIONAL: Cloudflare Analytics Engine for centralized logging
    // Uncomment to enable:
    // ────────────────────────────────────────────────────────────────────────
    // const cloudflareAdapters = createCloudflareAdapters({
    //   accountId: env.CLOUDFLARE_ACCOUNT_ID,
    //   apiToken: env.CLOUDFLARE_API_TOKEN,
    //   analyticsEngineLogs: {
    //     analyticsEngineBinding: env.AUTH_LOGS,
    //     accountId: env.CLOUDFLARE_ACCOUNT_ID,
    //     apiToken: env.ANALYTICS_ENGINE_API_TOKEN || env.CLOUDFLARE_API_TOKEN,
    //     dataset: "authhero_logs",
    //   },
    //   // Persist Auth0-style action execution records into a dedicated AE
    //   // dataset so the executions referenced by login logs live alongside
    //   // them. Requires a separate analytics_engine_datasets binding.
    //   analyticsEngineActionExecutions: {
    //     analyticsEngineBinding: env.AUTH_ACTION_EXECUTIONS,
    //     accountId: env.CLOUDFLARE_ACCOUNT_ID,
    //     apiToken: env.ANALYTICS_ENGINE_API_TOKEN || env.CLOUDFLARE_API_TOKEN,
    //     dataset: "authhero_action_executions",
    //   },
    // });

    // ────────────────────────────────────────────────────────────────────────
    // OPTIONAL: Rate Limiting
    // Uncomment to enable rate limiting on authentication endpoints:
    // ────────────────────────────────────────────────────────────────────────
    // const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    // const { success } = await env.RATE_LIMITER.limit({ key: clientIp });
    // if (!success) {
    //   return new Response("Rate limit exceeded", { status: 429 });
    // }

    const config: AuthHeroConfig = {
      dataAdapter,
      // ──────────────────────────────────────────────────────────────────────
      // OPTIONAL: Spread Cloudflare adapters to enable Analytics Engine logging
      // Uncomment when using createCloudflareAdapters above:
      // ──────────────────────────────────────────────────────────────────────
      // ...cloudflareAdapters,

      // Allow CORS for the Management API from admin UIs
      allowedOrigins: [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://manage.authhero.net",
        "https://local.authhero.net",
        origin,
      ].filter(Boolean),
    };

    const app = createApp(config);

    const envWithIssuer = {
      ...env,
      ISSUER: issuer,
    };

    return app.fetch(request, envWithIssuer);
  },
};
