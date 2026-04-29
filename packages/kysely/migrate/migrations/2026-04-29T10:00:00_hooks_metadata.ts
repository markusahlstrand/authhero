import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Adds `metadata` to `hooks` — a JSON-serialised property bag with two
 * well-known keys:
 *
 *   - `inheritable: true` — control-plane sync surfaces the hook to sub-tenants
 *   - template options, e.g. `copy_user_metadata: true` for `account-linking`
 *
 * Everything else is opaque.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("hooks").addColumn("metadata", "text").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("hooks").dropColumn("metadata").execute();
}
