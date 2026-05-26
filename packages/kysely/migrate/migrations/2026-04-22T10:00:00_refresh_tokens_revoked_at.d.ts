import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Adds `revoked_at_ts` to `refresh_tokens` so logout can soft-revoke tokens
 * by login session (mirroring the pattern on `sessions`) instead of paging
 * a list and hard-deleting one row at a time.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
