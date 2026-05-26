import { Database } from "../../src/db";
import { Kysely } from "kysely";
/**
 * Add missing OIDC profile claim columns to users table.
 * These are required for full OIDC Core 5.1 compliance:
 * - middle_name
 * - profile (URL of profile page)
 * - website
 * - gender
 * - birthdate (ISO 8601:2004 YYYY-MM-DD format)
 * - zoneinfo (e.g., "Europe/Paris")
 *
 * Also converts user_metadata from varchar(4096) to text to free up row space.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
