import { Database } from "../../src/db";
import { Kysely } from "kysely";
/**
 * Add preferred_username column to users table.
 * Per OIDC Core 5.1, preferred_username is the shorthand name
 * by which the End-User wishes to be referred to at the RP.
 * This is different from username which is used for authentication.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
