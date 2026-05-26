import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add a new login sessions table
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: restore the domains table
 */
export declare function down(db: Kysely<Database>): Promise<void>;
