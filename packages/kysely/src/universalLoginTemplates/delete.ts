import { Kysely } from "kysely";
import { Database } from "../db";

export function del(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<void> => {
    await db
      .deleteFrom("universal_login_templates")
      .where("tenant_id", "=", tenant_id)
      .execute();
  };
}
