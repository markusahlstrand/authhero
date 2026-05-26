import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: changes the primary key to id.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: drops the added sessions table fields
 */
export declare function down(db: Kysely<Database>): Promise<void>;
