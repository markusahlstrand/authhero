import { defineConfig } from "drizzle-kit";

// SQLite/D1 configuration for Cloudflare Workers
export default defineConfig({
  out: "./migrations",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
});
