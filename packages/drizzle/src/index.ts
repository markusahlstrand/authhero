/**
 * AuthHero Drizzle Adapter Package
 *
 * Provides both Drizzle ORM schemas and a full DataAdapters implementation
 * for SQLite/D1 (Cloudflare Workers).
 */

// Default export: adapter factory
export { default } from "./adapters";

// SQLite/D1 schema
export * as sqlite from "./schema/sqlite";
