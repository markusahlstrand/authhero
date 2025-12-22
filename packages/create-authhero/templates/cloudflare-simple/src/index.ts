import { D1Dialect } from "kysely-d1";
import { Kysely } from "kysely";
import createAdapters from "@authhero/kysely-adapter";
import createApp from "./app";
import { Env } from "./types";
import { AuthHeroConfig } from "authhero";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const issuer = `${url.protocol}//${url.host}/`;

    // Get the origin from the request for dynamic CORS
    const origin = request.headers.get("Origin") || "";

    const dialect = new D1Dialect({ database: env.AUTH_DB });
    const db = new Kysely<any>({ dialect });
    const dataAdapter = createAdapters(db);

    const config: AuthHeroConfig = {
      dataAdapter,
      // Allow CORS from common development origins
      allowedOrigins: [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://localhost:5173",
        "https://localhost:3000",
        "https://manage.authhero.net",
        "https://local.authhero.net",
        // Also allow the requesting origin in development
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
