import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Change connections table to use composite primary key (tenant_id, id)
 * This allows the same connection id to exist across different tenants.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Restore connections table with single id primary key
 */
export declare function down(db: Kysely<Database>): Promise<void>;
