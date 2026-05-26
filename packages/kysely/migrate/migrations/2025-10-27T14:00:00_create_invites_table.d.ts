import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Create invites table
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Drop invites table
 */
export declare function down(db: Kysely<Database>): Promise<void>;
