import { and, eq } from "drizzle-orm";
import type {
  UserActivity,
  UserActivityAdapter,
  UserActivityUpdate,
} from "@authhero/adapter-interfaces";
import { userActivity } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

// Maps the domain update onto storage columns, serializing failed_logins.
// Only keys that are explicitly provided are included, so an upsert never
// clobbers a field the caller didn't set. Mirrors the kysely adapter.
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
  if (activity.last_login !== undefined)
    columns.last_login = activity.last_login;
  if (activity.last_ip !== undefined) columns.last_ip = activity.last_ip;
  if (activity.login_count !== undefined)
    columns.login_count = activity.login_count;
  if (activity.failed_logins !== undefined)
    columns.failed_logins = JSON.stringify(activity.failed_logins);
  if (activity.last_password_reset !== undefined)
    columns.last_password_reset = activity.last_password_reset;
  return columns;
}

export function createUserActivityAdapter(db: DrizzleDb): UserActivityAdapter {
  return {
    async get(tenantId: string, userId: string): Promise<UserActivity | null> {
      const row = await db
        .select()
        .from(userActivity)
        .where(
          and(
            eq(userActivity.tenant_id, tenantId),
            eq(userActivity.user_id, userId),
          ),
        )
        .get();

      if (!row) return null;

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
    },

    async upsert(
      tenantId: string,
      userId: string,
      activity: UserActivityUpdate,
    ): Promise<void> {
      const columns = toColumns(activity);
      const insert = db.insert(userActivity).values({
        tenant_id: tenantId,
        user_id: userId,
        login_count: 0,
        ...columns,
      });

      if (Object.keys(columns).length === 0) {
        await insert.onConflictDoNothing();
        return;
      }

      await insert.onConflictDoUpdate({
        target: [userActivity.tenant_id, userActivity.user_id],
        set: columns,
      });
    },
  };
}
