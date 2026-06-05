import { Kysely, sql } from "kysely";

// Flip the default for `clients.is_first_party` from 0 to 1 so existing
// clients keep today's no-consent UX after the third-party consent gate
// lands. Tenants who actually run third-party clients should set
// `is_first_party=false` explicitly on those clients.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE clients SET is_first_party = 1 WHERE is_first_party = 0`.execute(
    db,
  );
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // No-op. We don't want to flip rows back arbitrarily on rollback.
}
