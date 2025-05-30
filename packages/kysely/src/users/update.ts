import { PostUsersBody } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    user: Partial<PostUsersBody>,
  ): Promise<boolean> => {
    const sqlUser = flattenObject({
      ...user,
      updated_at: new Date().toISOString(),
      app_metadata: user.app_metadata
        ? JSON.stringify(user.app_metadata)
        : undefined,
      user_metadata: user.user_metadata
        ? JSON.stringify(user.user_metadata)
        : undefined,
    });

    const results = await db
      .updateTable("users")
      .set(sqlUser)
      .where("users.tenant_id", "=", tenant_id)
      .where("users.user_id", "=", user_id)
      .execute();

    return results.length === 1;
  };
}
