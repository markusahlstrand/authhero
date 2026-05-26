import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add index for login_sessions.id lookups
 * This optimizes queries that filter by id alone, since the composite primary key
 * (tenant_id, id) doesn't efficiently support id-only queries
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Drop the login_sessions id index
 */
export declare function down(db: Kysely<Database>): Promise<void>;
