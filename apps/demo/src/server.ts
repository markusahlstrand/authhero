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
  OnExecutePreUserDeletionAPI,
  OnExecutePostUserDeletionAPI,
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
          onExecutePreUserDeletion: async (
            event: HookEvent & { user_id: string },
            api: OnExecutePreUserDeletionAPI,
          ) => {
            console.log(
              `onExecutePreUserDeletion hook triggered for user: ${event.user_id}`,
            );
            // Example: Validate deletion, check dependencies, etc.
            // api.cancel() to prevent deletion if needed
          },
          onExecutePostUserDeletion: async (
            event: HookEvent & { user_id: string },
            api: OnExecutePostUserDeletionAPI,
          ) => {
            console.log(
              `onExecutePostUserDeletion hook triggered for user: ${event.user_id}`,
            );
            // Example: Send notification, cleanup external systems, etc.
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
          onExecutePreUserDeletion: async (
            event: HookEvent & { user_id: string },
            api: OnExecutePreUserDeletionAPI,
          ) => {
            console.log(
              `onExecutePreUserDeletion hook triggered for user: ${event.user_id}`,
            );
          },
          onExecutePostUserDeletion: async (
            event: HookEvent & { user_id: string },
            api: OnExecutePostUserDeletionAPI,
          ) => {
            console.log(
              `onExecutePostUserDeletion hook triggered for user: ${event.user_id}`,
            );
          },
        },
      },
    });
  },
};

export default server;
