/**
 * Control-plane-only tables (issue #1026). These are deliberately kept out
 * of the core `sqlite` schema: the core migration set in `drizzle/` is
 * applied to every WFP tenant D1, while this set (generated into
 * `drizzle-control-plane/` via `drizzle.config.control-plane.ts`) is applied
 * only to control-plane databases. Both sets can share one database — apply
 * this one with a distinct `migrationsTable` so the journals don't collide:
 *
 * ```typescript
 * import { migrate } from "drizzle-orm/better-sqlite3/migrator";
 *
 * migrate(db, { migrationsFolder: coreFolder });
 * migrate(db, {
 *   migrationsFolder: controlPlaneFolder,
 *   migrationsTable: "__drizzle_migrations_control_plane",
 * });
 * ```
 */
export * from "./tenantOperations";
export * from "./rollouts";
