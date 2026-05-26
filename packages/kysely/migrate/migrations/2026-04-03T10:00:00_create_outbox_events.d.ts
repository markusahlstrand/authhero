import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Create outbox_events table for transactional audit logging
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Drop outbox_events table
 */
export declare function down(db: Kysely<Database>): Promise<void>;
