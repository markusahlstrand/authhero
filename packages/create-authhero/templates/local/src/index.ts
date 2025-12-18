import { serve } from "@hono/node-server";
import { SqliteDialect } from "kysely";
import { Kysely } from "kysely";
import Database from "better-sqlite3";
import createAdapters from "@authhero/kysely-adapter";
import createApp from "./app";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import https from "https";

// Generate self-signed certificates for local HTTPS if they don't exist
const certDir = path.join(process.cwd(), ".certs");
const keyPath = path.join(certDir, "localhost-key.pem");
const certPath = path.join(certDir, "localhost.pem");

function ensureCertificates() {
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log("🔑 Generating self-signed certificates for local HTTPS...");

    // Try mkcert first (if installed), otherwise fall back to openssl
    try {
      execSync(`which mkcert`, { stdio: "ignore" });
      execSync(
        `mkcert -key-file ${keyPath} -cert-file ${certPath} localhost 127.0.0.1`,
        {
          stdio: "inherit",
        },
      );
      console.log("✅ Certificates generated with mkcert");
    } catch {
      // Fall back to openssl
      try {
        execSync(
          `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`,
          { stdio: "inherit" },
        );
        console.log("✅ Self-signed certificates generated with openssl");
        console.log(
          "⚠️  You may need to trust the certificate in your browser",
        );
      } catch (err) {
        console.error(
          "❌ Failed to generate certificates. Please install mkcert or openssl",
        );
        console.error(
          "   Install mkcert: brew install mkcert && mkcert -install",
        );
        process.exit(1);
      }
    }
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

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
const issuer = process.env.ISSUER || `https://localhost:${port}/`;

// Get or generate certificates
const { key, cert } = ensureCertificates();

console.log(`🔐 AuthHero server running at https://localhost:${port}`);
console.log(`📚 API documentation available at https://localhost:${port}/docs`);
console.log(`🌐 Portal available at https://local.authhero.net`);

serve({
  fetch: (request) => {
    return app.fetch(request, {
      ISSUER: issuer,
      data: dataAdapter,
    });
  },
  port,
  createServer: https.createServer,
  serverOptions: { key, cert },
});
