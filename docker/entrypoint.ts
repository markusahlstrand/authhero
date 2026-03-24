import { serve } from "@hono/node-server";
import { SqliteDialect } from "kysely";
import { Kysely } from "kysely";
import Database from "better-sqlite3";
import createAdapters, { migrateToLatest } from "@authhero/kysely-adapter";
import { Context } from "hono";
import { AuthHeroConfig, init, seed } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import https from "https";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration from environment variables
const port = Number(process.env.PORT) || 3000;
const databasePath = process.env.DATABASE_PATH || "/data/db.sqlite";
const httpsEnabled = process.env.HTTPS_ENABLED === "true";
const shouldSeed = process.env.SEED === "true";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "admin";
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "";

const defaultIssuer = httpsEnabled
  ? `https://localhost:${port}/`
  : `http://localhost:${port}/`;
const issuer = process.env.ISSUER || defaultIssuer;

// Ensure the database directory exists
const dbDir = path.dirname(databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database
let db: Kysely<any>;
try {
  const dialect = new SqliteDialect({
    database: new Database(databasePath),
  });
  db = new Kysely<any>({ dialect });
} catch (error) {
  console.error("Failed to initialize database:");
  console.error(
    error instanceof Error ? error.message : "Unknown error occurred",
  );
  process.exit(1);
}

// Run migrations
console.log("Running migrations...");
try {
  await migrateToLatest(db);
  console.log("Migrations completed successfully");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}

const dataAdapter = createAdapters(db);

// Seed if requested
if (shouldSeed) {
  try {
    const result = await seed(dataAdapter, {
      adminUsername,
      adminPassword,
      issuer,
      tenantId: "control_plane",
      tenantName: "Control Plane",
      isControlPlane: true,
    });
    console.log(`Seed complete — client_id: ${result.clientId}`);
  } catch (error) {
    // Seed is idempotent, log but don't crash
    console.error("Seed error:", error);
  }
}

// Build allowed origins list
const allowedOrigins = allowedOriginsEnv
  ? allowedOriginsEnv.split(",").map((o) => o.trim())
  : [
      "https://manage.authhero.net",
      "https://local.authhero.net",
      "http://localhost:5173",
    ];

// Resolve widget path
const widgetPath = path.resolve(
  __dirname,
  "../node_modules/@authhero/widget/dist/authhero-widget",
);

// Create AuthHero app
const config: AuthHeroConfig = {
  dataAdapter,
  allowedOrigins,
  widgetHandler: serveStatic({
    root: widgetPath,
    rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  }),
};

const { app } = init(config);

app
  .get("/", async (ctx: Context) => {
    return ctx.json({
      name: "AuthHero Server",
      status: "running",
    });
  })
  .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

// Start server
if (httpsEnabled) {
  const certDir = path.join(process.cwd(), ".certs");
  const keyPath = path.join(certDir, "localhost-key.pem");
  const certPath = path.join(certDir, "localhost.pem");

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log("Generating self-signed certificates...");
    try {
      execSync(
        `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`,
        { stdio: "inherit" },
      );
    } catch {
      console.error("Failed to generate certificates. Ensure openssl is installed.");
      process.exit(1);
    }
  }

  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);

  console.log(`AuthHero server running at https://localhost:${port}`);

  serve({
    fetch: (request) =>
      app.fetch(request, { ISSUER: issuer, data: dataAdapter }),
    port,
    createServer: https.createServer,
    serverOptions: { key, cert },
  });
} else {
  console.log(`AuthHero server running at http://localhost:${port}`);
  console.log(`API documentation available at http://localhost:${port}/docs`);

  serve({
    fetch: (request) =>
      app.fetch(request, { ISSUER: issuer, data: dataAdapter }),
    port,
  });
}
