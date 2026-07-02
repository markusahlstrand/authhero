/**
 * AuthHero SQLite/D1 Schema for Drizzle ORM
 *
 * This schema is designed to match the Kysely schema used at runtime.
 * Use drizzle-kit to generate migrations for D1.
 *
 * Usage:
 *   pnpm drizzle-kit generate:sqlite
 */

// Tenants
export * from "./tenants";

// Actions (actions, versions, executions)
export * from "./actions";

// Users & Authentication
export * from "./users";
export * from "./userActivity";
export * from "./sessions";

// Clients & Grants
export * from "./clients";

// Connections & Domains
export * from "./connections";

// Organizations
export * from "./organizations";

// Roles & Permissions
export * from "./roles";

// Branding & UI
export * from "./branding";

// Authentication Methods
export * from "./authenticationMethods";

// Logs
export * from "./logs";

// Outbox
export * from "./outbox";

// Proxy routes (used by @authhero/proxy)
export * from "./proxyRoutes";
