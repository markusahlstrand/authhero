import { Kysely } from "kysely";
import { Database } from "../db";
import { UniversalLoginTemplate } from "@authhero/adapter-interfaces";

export function set(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    template: UniversalLoginTemplate,
  ): Promise<void> => {
    const now = Date.now();

    await db
      .insertInto("universal_login_templates")
      .values({
        tenant_id,
        body: template.body,
        created_at_ts: now,
        updated_at_ts: now,
      })
      .onConflict((oc) =>
        oc.column("tenant_id").doUpdateSet({
          body: template.body,
          updated_at_ts: now,
        }),
      )
      .execute();
  };
}
