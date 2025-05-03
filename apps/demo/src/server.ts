import { OpenAPIHono } from "@hono/zod-openapi";
import { SqliteDialect } from "kysely";
import { Kysely } from "kysely";
import createApp from "./app";
import createAdapters from "@authhero/kysely-adapter";
import { Bindings, Variables } from "authhero";
import Database from "better-sqlite3";

interface Env {
  DATABASE_HOST: string;
  DATABASE_USERNAME: string;
  DATABASE_PASSWORD: string;
}

let app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }> | undefined;

const server = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!app) {
      const dialect = new SqliteDialect({
        database: new Database("db.sqlite"),
      });
      const db = new Kysely<any>({ dialect });
      const dataAdapter = createAdapters(db);

      app = createApp({
        dataAdapter,
      });
    }

    return app.fetch(request);
  },
};

export default server;
