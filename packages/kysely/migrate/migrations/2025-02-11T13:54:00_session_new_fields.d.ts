import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: adds missing fields to the sessions.
 */
export declare function up(_: Kysely<Database>): Promise<void>;
/**
 * Down migration: drops the added sessions table fields
 */
export declare function down(_: Kysely<any>): Promise<void>;
