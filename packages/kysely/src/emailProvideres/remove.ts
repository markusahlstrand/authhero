import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<void> => {
    await db
      .deleteFrom("email_providers")
      .where("tenant_id", "=", tenant_id)
      .execute();
  };
}
