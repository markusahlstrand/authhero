import { Kysely } from "kysely";
import {
  UserActivity,
  UserActivityAdapter,
  UserActivityUpdate,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type UserActivityRow = Database["user_activity"];

function rowToActivity(row: UserActivityRow): UserActivity {
  return {
    user_id: row.user_id,
    last_login: row.last_login ?? undefined,
    last_ip: row.last_ip ?? undefined,
    login_count: row.login_count,
    failed_logins: row.failed_logins
      ? (JSON.parse(row.failed_logins) as string[])
      : undefined,
    last_password_reset: row.last_password_reset ?? undefined,
  };
}

// Maps the domain update onto storage columns, serializing failed_logins.
// Only keys that are explicitly provided are included, so an upsert never
// clobbers a field the caller didn't set.
function toColumns(activity: UserActivityUpdate): {
  last_login?: string;
  last_ip?: string;
  login_count?: number;
  failed_logins?: string;
  last_password_reset?: string;
} {
  const columns: {
    last_login?: string;
    last_ip?: string;
    login_count?: number;
    failed_logins?: string;
    last_password_reset?: string;
  } = {};
  if (activity.last_login !== undefined) columns.last_login = activity.last_login;
  if (activity.last_ip !== undefined) columns.last_ip = activity.last_ip;
  if (activity.login_count !== undefined)
    columns.login_count = activity.login_count;
  if (activity.failed_logins !== undefined)
    columns.failed_logins = JSON.stringify(activity.failed_logins);
  if (activity.last_password_reset !== undefined)
    columns.last_password_reset = activity.last_password_reset;
  return columns;
}

export function createUserActivityAdapter(
  db: Kysely<Database>,
): UserActivityAdapter {
  return {
    async get(tenantId, userId) {
      const row = await db
        .selectFrom("user_activity")
        .where("tenant_id", "=", tenantId)
        .where("user_id", "=", userId)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToActivity(row) : null;
    },

    // No cross-dialect UPSERT helper exists in this codebase, so follow the
    // grants adapter's select-then-insert-or-update pattern, with an
    // insert-race fallback to update (concurrent first logins).
    async upsert(tenantId, userId, activity) {
      const columns = toColumns(activity);

      const existing = await db
        .selectFrom("user_activity")
        .where("tenant_id", "=", tenantId)
        .where("user_id", "=", userId)
        .select("user_id")
        .executeTakeFirst();

      if (existing) {
        if (Object.keys(columns).length === 0) return;
        await db
          .updateTable("user_activity")
          .set(columns)
          .where("tenant_id", "=", tenantId)
          .where("user_id", "=", userId)
          .execute();
        return;
      }

      try {
        await db
          .insertInto("user_activity")
          .values({
            tenant_id: tenantId,
            user_id: userId,
            login_count: 0,
            ...columns,
          })
          .execute();
      } catch {
        // Lost the insert race with a concurrent first write — update instead.
        if (Object.keys(columns).length === 0) return;
        await db
          .updateTable("user_activity")
          .set(columns)
          .where("tenant_id", "=", tenantId)
          .where("user_id", "=", userId)
          .execute();
      }
    },
  };
}
