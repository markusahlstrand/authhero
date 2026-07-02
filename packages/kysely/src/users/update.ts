import { PostUsersBody, User } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";
import { createUserActivityAdapter } from "../userActivity";

export function update(db: Kysely<Database>) {
  const userActivity = createUserActivityAdapter(db);

  return async (
    tenant_id: string,
    user_id: string,
    user: Partial<PostUsersBody & User>,
  ): Promise<boolean> => {
    // Activity counters live in user_activity (issue #1003). Split them off
    // so callers that still pass them (e.g. adapters without a userActivity
    // implementation went through this path historically) keep working.
    const { last_login, last_ip, login_count, ...profileFields } = user;

    const sqlUser = flattenObject({
      ...profileFields,
      updated_at: new Date().toISOString(),
      app_metadata: user.app_metadata
        ? JSON.stringify(user.app_metadata)
        : undefined,
      user_metadata: user.user_metadata
        ? JSON.stringify(user.user_metadata)
        : undefined,
      address: user.address ? JSON.stringify(user.address) : undefined,
      phone_verified:
        user.phone_verified !== undefined
          ? user.phone_verified
            ? 1
            : 0
          : undefined,
    });

    if (
      last_login !== undefined ||
      last_ip !== undefined ||
      login_count !== undefined
    ) {
      await userActivity.upsert(tenant_id, user_id, {
        last_login,
        last_ip,
        login_count,
      });
    }

    const results = await db
      .updateTable("users")
      .set(sqlUser)
      .where("users.tenant_id", "=", tenant_id)
      .where("users.user_id", "=", user_id)
      .execute();

    return results.length === 1;
  };
}
