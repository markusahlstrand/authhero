import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Change logs table primary key from id to log_id
 * Note: This clears all existing logs data due to table recreation
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Revert to id as primary key
 */
export declare function down(db: Kysely<Database>): Promise<void>;
