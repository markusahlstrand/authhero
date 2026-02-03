import { Kysely } from "kysely";
import { Database } from "../db";
import { UniversalLoginTemplate } from "@authhero/adapter-interfaces";

export function set(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    template: UniversalLoginTemplate,
  ): Promise<void> => {
    const now = Date.now();

    try {
      await db
        .insertInto("universal_login_templates")
        .values({
          tenant_id,
          body: template.body,
          created_at_ts: now,
          updated_at_ts: now,
        })
        .execute();
    } catch (error) {
      await db
        .updateTable("universal_login_templates")
        .set({
          body: template.body,
          updated_at_ts: now,
        })
        .where("tenant_id", "=", tenant_id)
        .execute();
    }
  };
}
