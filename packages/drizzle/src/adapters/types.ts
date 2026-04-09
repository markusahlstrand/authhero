import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "../schema/sqlite";

/**
 * The Drizzle database instance type.
 * Works with both better-sqlite3 (sync, for testing) and D1 (async, for production).
 */
export type DrizzleDb = BaseSQLiteDatabase<"sync" | "async", any, typeof schema>;
