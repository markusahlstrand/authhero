import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add optimized index for phone number queries
 * This index optimizes queries that filter by tenant_id, phone_number, and provider
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Drop the phone number index
 */
export declare function down(db: Kysely<Database>): Promise<void>;
