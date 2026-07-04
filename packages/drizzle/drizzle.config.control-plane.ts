import { defineConfig } from "drizzle-kit";

// Control-plane-only tables (tenant_operations, tenant_operation_events,
// rollouts — issue #1026). Kept as a separate migration set so WFP tenant
// D1s, which apply everything in `drizzle/`, never get these tables.
// Generate with:
//   pnpm exec drizzle-kit generate --config drizzle.config.control-plane.ts
export default defineConfig({
  out: "./drizzle-control-plane",
  schema: "./src/schema/control-plane/index.ts",
  dialect: "sqlite",
});
