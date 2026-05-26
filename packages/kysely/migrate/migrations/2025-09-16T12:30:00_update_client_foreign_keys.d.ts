import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Updates foreign key constraints to reference the new clients table
 * instead of the applications table.
 * Supports both MySQL/PlanetScale and SQLite databases.
 *
 * Also takes the opportunity to:
 * - Add composite primary keys (tenant_id, id) to improve multi-tenant performance
 * - Upgrade problematic varchar fields to text type for better length handling:
 *   - authParams_state, authParams_redirect_uri, authorization_url in login_sessions
 *   - resource_servers, device in refresh_tokens
 *   - useragent in login_sessions
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Reverts foreign key constraints back to reference applications table.
 * NOTE: This is a destructive operation and may cause data loss.
 */
export declare function down(db: Kysely<Database>): Promise<void>;
