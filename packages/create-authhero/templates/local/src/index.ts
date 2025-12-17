import { serve } from "@hono/node-server";
import { SqliteDialect } from "kysely";
import { Kysely } from "kysely";
import Database from "better-sqlite3";
import createAdapters from "@authhero/kysely-adapter";
import createApp from "./app";

// Initialize SQLite database
let db: Kysely<any>;
try {
  const dialect = new SqliteDialect({
    database: new Database("db.sqlite"),
  });
  db = new Kysely<any>({ dialect });
} catch (error) {
  console.error("❌ Failed to initialize database:");
  console.error(
    error instanceof Error ? error.message : "Unknown error occurred",
  );
  console.error("\nPossible causes:");
  console.error("  - File permissions issue");
  console.error("  - Disk space is full");
  console.error("  - Database file is corrupted");
  console.error("\nTry running: npm run migrate");
  process.exit(1);
}

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
