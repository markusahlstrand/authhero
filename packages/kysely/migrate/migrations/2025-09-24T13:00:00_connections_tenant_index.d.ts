import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add tenant_id index for connections table
 * This optimizes queries that filter connections by tenant_id
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Drop the connections tenant_id index
 */
export declare function down(db: Kysely<Database>): Promise<void>;
