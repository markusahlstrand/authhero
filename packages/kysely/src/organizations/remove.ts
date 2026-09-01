import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenantId: string, id: string): Promise<boolean> => {
    // `execute()` returns one DeleteResult per statement, so its length is 1
    // even when nothing matched — check the deleted row count instead, like
    // every other entity's remove(). Otherwise DELETE /organizations/{id}
    // answers 200 for an unknown organization instead of Auth0's 404.
    const result = await db
      .deleteFrom("organizations")
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  };
}
