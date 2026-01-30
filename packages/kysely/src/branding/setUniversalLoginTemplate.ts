import { Kysely } from "kysely";
import { Database } from "../db";

export function setUniversalLoginTemplate(db: Kysely<Database>) {
  return async (tenant_id: string, template: string): Promise<void> => {
    const now = new Date().toISOString();

    // Try to update first, if no rows affected, insert
    const result = await db
      .updateTable("universal_login_templates")
      .set({
        template,
        updated_at: now,
      })
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    if (!result.numUpdatedRows || result.numUpdatedRows === BigInt(0)) {
      await db
        .insertInto("universal_login_templates")
        .values({
          tenant_id,
          template,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }
  };
}
