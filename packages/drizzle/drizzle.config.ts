import { defineConfig } from "drizzle-kit";

// SQLite/D1 configuration for Cloudflare Workers
export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema/sqlite/index.ts",
  dialect: "sqlite",
});
