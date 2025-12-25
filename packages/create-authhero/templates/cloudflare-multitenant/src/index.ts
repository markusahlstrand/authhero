import { D1Dialect } from "kysely-d1";
import { Kysely } from "kysely";
import createAdapters from "@authhero/kysely-adapter";
import createApp from "./app";
import { Env } from "./types";
import { AuthHeroConfig } from "@authhero/multi-tenancy";

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

    const dialect = new D1Dialect({ database: env.AUTH_DB });
    const db = new Kysely<any>({ dialect });
    const dataAdapter = createAdapters(db);

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
    // });

    // ────────────────────────────────────────────────────────────────────────
    // OPTIONAL: Rate Limiting
    // Uncomment to enable rate limiting on authentication endpoints:
    // ────────────────────────────────────────────────────────────────────────
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
        "https://localhost:3000",
        "https://manage.authhero.net",
        "https://local.authhero.net",
        origin,
      ].filter(Boolean),
    };

    const app = createApp(config);

    // Pass the issuer via env bindings
    const envWithIssuer = {
      ...env,
      ISSUER: issuer,
    };

    return app.fetch(request, envWithIssuer);
  },
};
