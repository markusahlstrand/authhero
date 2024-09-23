import { PostUsersBody } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

function getEmailVerified(user: Partial<PostUsersBody>): number | undefined {
  if (user.email_verified === undefined) {
    return undefined;
  }

  return user.email_verified ? 1 : 0;
}

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    user: Partial<PostUsersBody>,
  ): Promise<boolean> => {
    const sqlUser = {
      ...user,
      email_verified: getEmailVerified(user),
      updated_at: new Date().toISOString(),
    };

    // TODO: this currently overwrites the entire app_metadata and user_metadata. Should it be merged instead?
    if (user.app_metadata) {
      sqlUser.app_metadata = JSON.stringify(user.app_metadata);
    }

    if (user.user_metadata) {
      sqlUser.user_metadata = JSON.stringify(user.user_metadata);
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
