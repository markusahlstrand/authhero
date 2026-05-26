import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add unique index on (username, provider, tenant_id)
 * Prevents two users from having the same username within the same tenant and provider.
 *
 * Before creating the index we remove legacy duplicate rows, keeping the
 * oldest user (smallest created_at, tie-broken by user_id) for each
 * (username, provider, tenant_id) group.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Drop the unique username index
 */
export declare function down(db: Kysely<Database>): Promise<void>;
