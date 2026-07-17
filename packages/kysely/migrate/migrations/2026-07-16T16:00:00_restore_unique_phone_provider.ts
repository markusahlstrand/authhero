import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
import { migrationLog } from "../log";

/**
 * Restore uniqueness on (phone_number, provider, tenant_id).
 *
 * `unique_phone_provider` has been declared on `users` since the very first
 * migration (2022-12-11T09:17:35_init), as a table constraint. Production does
 * not have it, so the baseline — snapshotted from production — doesn't either,
 * and squashing onto that baseline silently dropped it.
 *
 * It is load-bearing rather than decorative: the management API returns 409 on
 * a duplicate user by catching the unique violation (ER_DUP_ENTRY /
 * SQLITE_CONSTRAINT_UNIQUE) that this raises. Without it, POST /api/v2/users
 * with an already-registered phone number returns 201 and creates a second
 * user, which is neither what Auth0 does nor what the adapter expects.
 *
 * Declared here as a unique INDEX rather than the original table constraint
 * because a constraint cannot be added to an existing table on SQLite, and the
 * two are equivalent for enforcement — MySQL implements a unique constraint as
 * a unique index anyway. The name is kept so both engines agree.
 *
 * The dedupe below mirrors 2026-02-25T12:00:00_unique_username_provider, which
 * faced the same problem for usernames: production may hold duplicate rows that
 * the index would reject, so they have to go first or the DDL fails. On a fresh
 * database (baseline, then this) there is nothing to dedupe and step 1 is a
 * no-op.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // 1. Find duplicate (phone_number, provider, tenant_id) groups and log them.
  const { rows: dupes } = await sql<{
    phone_number: string;
    provider: string;
    tenant_id: string;
    cnt: number;
  }>`
    SELECT phone_number, provider, tenant_id, COUNT(*) AS cnt
    FROM users
    WHERE phone_number IS NOT NULL
    GROUP BY phone_number, provider, tenant_id
    HAVING COUNT(*) > 1
  `.execute(db);

  if (dupes.length > 0) {
    migrationLog(
      `Found ${dupes.length} duplicate (phone_number, provider, tenant_id) group(s) – cleaning up…`,
    );
    for (const d of dupes) {
      migrationLog(`  provider=${d.provider} count=${d.cnt}`);
    }

    // 2. Delete duplicates, keeping the smallest user_id per group. The
    //    row-value sub-query is compatible with both MySQL and SQLite.
    //
    //    Each sub-query reads `users`, the same table the DELETE modifies,
    //    which MySQL rejects with ER_UPDATE_TABLE_USED (1093). Wrapping each
    //    one in an outer SELECT forces it into a materialized derived table,
    //    so the read finishes before the delete touches a row.
    await sql`
      DELETE FROM users
      WHERE phone_number IS NOT NULL
        AND (user_id, tenant_id) NOT IN (
          SELECT keep.user_id, keep.tenant_id FROM (
            SELECT MIN(user_id) AS user_id, tenant_id
            FROM users
            WHERE phone_number IS NOT NULL
            GROUP BY phone_number, provider, tenant_id
          ) AS keep
        )
        AND (phone_number, provider, tenant_id) IN (
          SELECT dupes.phone_number, dupes.provider, dupes.tenant_id FROM (
            SELECT phone_number, provider, tenant_id
            FROM users
            WHERE phone_number IS NOT NULL
            GROUP BY phone_number, provider, tenant_id
            HAVING COUNT(*) > 1
          ) AS dupes
        )
    `.execute(db);

    migrationLog("Duplicate rows removed.");
  }

  // 3. Now safe to create the unique index.
  await db.schema
    .createIndex("unique_phone_provider")
    .on("users")
    .unique()
    .columns(["phone_number", "provider", "tenant_id"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Rows removed by the dedupe are not restored — they could not coexist with
  // the index this reverts.
  await db.schema.dropIndex("unique_phone_provider").execute();
}
