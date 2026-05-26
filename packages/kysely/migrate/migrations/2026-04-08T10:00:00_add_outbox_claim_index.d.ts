import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add composite index for outbox drain queries (cron relay)
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Drop the outbox claim index
 */
export declare function down(db: Kysely<Database>): Promise<void>;
