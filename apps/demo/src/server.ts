import { OpenAPIHono } from "@hono/zod-openapi";
import { SqliteDialect } from "kysely";
import { Kysely } from "kysely";
import createApp from "./app";
import createAdapters from "@authhero/kysely-adapter";
import {
  AuthHeroConfig,
  Bindings,
  HookEvent,
  OnExecutePostLoginAPI,
  Variables,
} from "authhero";
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

      const config: AuthHeroConfig = {
        dataAdapter,
        hooks: {
          onExecutePostLogin: async (
            event: HookEvent,
            api: OnExecutePostLoginAPI,
          ) => {
            console.log("onExecutePostLogin hook triggered");
            return event.user;
          },
        },
      };

      app = createApp(config);
    }

    return app.fetch(request, {
      env: {
        ...env,
        hooks: {
          onExecutePostLogin: async (
            event: HookEvent,
            api: OnExecutePostLoginAPI,
          ) => {
            console.log("onExecutePostLogin hook triggered");
            return event.user;
          },
        },
      },
    });
  },
};

export default server;
