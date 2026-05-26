import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Adds `user_linking_mode` to `clients`. Per-client override for the built-in
 * email-based user-linking path: `builtin` (default), `template`, or `off`.
 * Resolved against the service-level `userLinkingMode` config.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
