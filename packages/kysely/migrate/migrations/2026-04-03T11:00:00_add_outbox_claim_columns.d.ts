import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add claim/lease columns to outbox_events for concurrent worker safety
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Remove claim/lease columns from outbox_events
 */
export declare function down(db: Kysely<Database>): Promise<void>;
