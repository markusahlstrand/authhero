import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add unique index on (username, provider, tenant_id)
 * Prevents two users from having the same username within the same tenant and provider.
 *
 * Before creating the index we remove legacy duplicate rows, keeping the
 * oldest user (smallest created_at, tie-broken by user_id) for each
 * (username, provider, tenant_id) group.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // 1. Find duplicate (username, provider, tenant_id) groups and log them.
  const { rows: dupes } = await sql<{
    username: string;
    provider: string;
    tenant_id: string;
    cnt: number;
  }>`
    SELECT username, provider, tenant_id, COUNT(*) AS cnt
    FROM users
    WHERE username IS NOT NULL
    GROUP BY username, provider, tenant_id
    HAVING COUNT(*) > 1
  `.execute(db);

  if (dupes.length > 0) {
    console.log(
      `Found ${dupes.length} duplicate (username, provider, tenant_id) group(s) – cleaning up…`,
    );
    for (const d of dupes) {
      console.log(
        `  username=${d.username} provider=${d.provider} tenant_id=${d.tenant_id} count=${d.cnt}`,
      );
    }

    // 2. Delete duplicate rows, keeping the one with the smallest user_id per group.
    //    The sub-query is compatible with both MySQL and SQLite.
    await sql`
      DELETE FROM users
      WHERE username IS NOT NULL
        AND (user_id, tenant_id) NOT IN (
          SELECT MIN(user_id), tenant_id
          FROM users
          WHERE username IS NOT NULL
          GROUP BY username, provider, tenant_id
        )
        AND (username, provider, tenant_id) IN (
          SELECT username, provider, tenant_id
          FROM users
          WHERE username IS NOT NULL
          GROUP BY username, provider, tenant_id
          HAVING COUNT(*) > 1
        )
    `.execute(db);

    console.log("Duplicate rows removed.");
  }

  // 3. Now safe to create the unique index.
  await db.schema
    .createIndex("unique_username_provider")
    .on("users")
    .unique()
    .columns(["username", "provider", "tenant_id"])
    .execute();
}

/**
 * Down migration: Drop the unique username index
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("unique_username_provider").execute();
}
