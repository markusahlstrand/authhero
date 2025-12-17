import { serve } from "@hono/node-server";
import { SqliteDialect } from "kysely";
import { Kysely } from "kysely";
import Database from "better-sqlite3";
import createAdapters from "@authhero/kysely-adapter";
import createApp from "./app";

// Initialize SQLite database
const dialect = new SqliteDialect({
  database: new Database("db.sqlite"),
});

const db = new Kysely<any>({ dialect });
const dataAdapter = createAdapters(db);

// Create the AuthHero app
const app = createApp({ dataAdapter });

// Start the server
const port = Number(process.env.PORT) || 3000;

console.log(`🔐 AuthHero server running at http://localhost:${port}`);
console.log(`📚 API documentation available at http://localhost:${port}/docs`);

serve({
  fetch: app.fetch,
  port,
});
