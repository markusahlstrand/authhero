import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add a new custom domains table
 */
export declare function up(_: Kysely<Database>): Promise<void>;
/**
 * Down migration: restore the domains table
 */
export declare function down(_: Kysely<Database>): Promise<void>;
