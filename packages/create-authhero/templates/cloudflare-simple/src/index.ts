import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Dialect } from "kysely-d1";
import { Kysely } from "kysely";
import createAdapters from "@authhero/kysely-adapter";
import createApp from "./app";
import { Env } from "./types";
import { AuthHeroConfig, Bindings, Variables } from "authhero";

let app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }> | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!app) {
      const dialect = new D1Dialect({ database: env.AUTH_DB });
      const db = new Kysely<any>({ dialect });
      const dataAdapter = createAdapters(db);

      const config: AuthHeroConfig = {
        dataAdapter,
      };

      app = createApp(config);
    }

    return app.fetch(request, { env });
  },
};
