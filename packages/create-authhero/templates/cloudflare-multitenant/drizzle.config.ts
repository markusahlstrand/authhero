import { defineConfig } from "drizzle-kit";

// SQLite/D1 configuration for Cloudflare Workers
// Uses the schema from @authhero/drizzle package
export default defineConfig({
  out: "./node_modules/@authhero/drizzle/drizzle",
  schema: "./node_modules/@authhero/drizzle/src/schema/sqlite/index.ts",
  dialect: "sqlite",
});
