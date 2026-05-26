import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Drop old columns
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: restore the domains table
 */
export declare function down(_: Kysely<Database>): Promise<void>;
