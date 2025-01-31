import { Kysely } from "kysely";
import { Database } from "../db";

export function unlink(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    provider: string,
    linked_user_id: string,
  ): Promise<boolean> => {
    const unsafeTypeUser: any = { linked_to: null };

    const results = await db
      .updateTable("users")
      .set(unsafeTypeUser)
      .where("users.tenant_id", "=", tenant_id)
      .where("users.user_id", "=", `${provider}|${linked_user_id}`)
      .where("users.linked_to", "=", `${user_id}`)
      .execute();

    return results.length === 1;
  };
}
