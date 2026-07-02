import { PostUsersBody, User } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";
import { createUserActivityAdapter } from "../userActivity";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    // Only widened with the activity fields — a broader type (e.g.
    // Partial<User>) would let non-column fields like `identities` leak into
    // flattenObject() and the .set() below.
    user: Partial<PostUsersBody> &
      Partial<Pick<User, "last_login" | "last_ip" | "login_count">>,
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

    // Update the user row first and only write activity once the row is
    // confirmed to exist — in one transaction, so a missing user never gains
    // an orphaned activity row and a failed activity write rolls both back.
    const execute = async (trx: Kysely<Database>): Promise<boolean> => {
      const [result] = await trx
        .updateTable("users")
        .set(sqlUser)
        .where("users.tenant_id", "=", tenant_id)
        .where("users.user_id", "=", user_id)
        .execute();

      if (!result || result.numUpdatedRows === 0n) {
        return false;
      }

      if (
        last_login !== undefined ||
        last_ip !== undefined ||
        login_count !== undefined
      ) {
        await createUserActivityAdapter(trx).upsert(tenant_id, user_id, {
          last_login,
          last_ip,
          login_count,
        });
      }

      return true;
    };

    if (db.isTransaction) {
      return execute(db);
    }
    return db.transaction().execute(execute);
  };
}
