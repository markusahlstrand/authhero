import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Create organizations table
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Drop organizations table
 */
export declare function down(db: Kysely<Database>): Promise<void>;
