import { OpenAPIHono } from "@hono/zod-openapi";
import { PlanetScaleDialect } from "kysely-planetscale";
import { Kysely } from "kysely";
import createApp from "./app";
import createAdapters from "@authhero/kysely-adapter";

interface Env {
  DATABASE_HOST: string;
  DATABASE_USERNAME: string;
  DATABASE_PASSWORD: string;
}

let app: OpenAPIHono | undefined;

const server = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!app) {
      const dialect = new PlanetScaleDialect({
        host: env.DATABASE_HOST,
        username: env.DATABASE_USERNAME,
        password: env.DATABASE_PASSWORD,
        fetch: (opts, init) =>
          fetch(new Request(opts, { ...init, cache: undefined })),
      });
      const db = new Kysely<any>({ dialect });
      const dataAdapter = createAdapters(db);

      app = createApp(dataAdapter);
    }

    return app.fetch(request);
  },
};

export default server;
