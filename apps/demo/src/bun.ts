import { Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-sqlite";
import createAdapters from "@authhero/kysely-adapter";
// @ts-ignore
import * as bunSqlite from "bun:sqlite";

import createApp from "./app";

const dialect = new BunSqliteDialect({
  database: new bunSqlite.Database("db.sqlite"),
});
const db = new Kysely<any>({
  dialect,
});

const dataAdapter = createAdapters(db);

const app = createApp(dataAdapter);

const server = {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, {
      ...process.env,
    });
  },
};

export default server;
