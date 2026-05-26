import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Adds the columns needed for Auth0-style refresh-token rotation and at-rest
 * hashing. All columns are nullable so legacy (pre-rotation) rows continue to
 * resolve via the `id`-only lookup path during the back-compat window.
 *
 *   - `token_lookup`: plaintext lookup slice extracted from the wire token
 *     (`rt_<lookup>.<secret>`); indexed for the refresh-grant path.
 *   - `token_hash`: SHA-256 hex of the secret part of the wire token.
 *   - `family_id`: root token id of a rotation chain. Used to revoke an
 *     entire family on reuse detection or admin revocation.
 *   - `rotated_to`: most recently issued child id (debug/traceability).
 *   - `rotated_at_ts`: time of the *first* rotation; anchors the leeway
 *     window so siblings minted within it don't extend exposure.
 *
 * Each addColumn / dropColumn is its own ALTER TABLE statement because
 * SQLite (and some MySQL configurations) don't accept multiple ADD COLUMN
 * clauses in a single ALTER TABLE.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
