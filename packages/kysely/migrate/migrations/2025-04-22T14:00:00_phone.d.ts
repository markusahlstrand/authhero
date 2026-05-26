import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add phone_number and username
 */
export declare function up(_: Kysely<Database>): Promise<void>;
/**
 * Down migration: restore the domains table
 */
export declare function down(db: Kysely<Database>): Promise<void>;
