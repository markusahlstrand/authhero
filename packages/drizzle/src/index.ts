/**
 * AuthHero Drizzle Schema Package
 * 
 * This package provides Drizzle ORM schemas for AuthHero.
 * Currently supports SQLite/D1 for Cloudflare Workers.
 * 
 * Use drizzle-kit to generate migrations from these schemas.
 */

// SQLite/D1 schema
export * as sqlite from "./schema/sqlite";
