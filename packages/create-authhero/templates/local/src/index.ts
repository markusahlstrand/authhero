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
const app = createApp({
  dataAdapter,
  allowedOrigins: [
    "https://manage.authhero.net",
    "https://local.authhero.net",
    "http://localhost:5173",
  ],
});

// Start the server
const port = Number(process.env.PORT) || 3000;
const issuer = process.env.ISSUER || `http://localhost:${port}/`;

console.log(`🔐 AuthHero server running at http://localhost:${port}`);
console.log(`📚 API documentation available at http://localhost:${port}/docs`);
console.log(`🌐 Portal available at https://local.authhero.net`);

serve({
  fetch: (request) => {
    return app.fetch(request, {
      ISSUER: issuer,
      data: dataAdapter,
    });
  },
  port,
});
