import { Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-sqlite";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
// @ts-ignore
import * as bunSqlite from "bun:sqlite";

import createApp from "./app";
import { createX509Certificate } from "./helpers/encryption";

const dialect = new BunSqliteDialect({
  database: new bunSqlite.Database("db.sqlite"),
});
const db = new Kysely<any>({
  dialect,
});

// Run the migrations
await migrateToLatest(db);

const dataAdapter = createAdapters(db);

const app = createApp(dataAdapter);
const keys = await dataAdapter.keys.list();
if (keys.length === 0) {
  const signingKey = await createX509Certificate({
    name: `CN=demo`,
  });
  await dataAdapter.keys.create(signingKey);

  await dataAdapter.tenants.create({
    id: "default",
    name: "Default Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  console.log("Initiated database");
}

const server = {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, {
      ...process.env,
      data: dataAdapter,
    });
  },
};

export default server;
