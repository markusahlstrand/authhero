import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: creates the `refresh_tokens` table.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: drops the `refresh_tokens` table.
 */
export declare function down(db: Kysely<any>): Promise<void>;
