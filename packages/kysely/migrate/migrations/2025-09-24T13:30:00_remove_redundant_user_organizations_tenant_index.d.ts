import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Remove redundant tenant_id index from user_organizations
 * The unique constraint (tenant_id, user_id, organization_id) already provides
 * efficient indexing for tenant_id queries, making the separate tenant_id index redundant
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Recreate the tenant_id index
 */
export declare function down(db: Kysely<Database>): Promise<void>;
