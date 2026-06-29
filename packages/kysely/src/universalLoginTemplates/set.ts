import { Kysely } from "kysely";
import { Database } from "../db";
import {
  CreateOptions,
  UniversalLoginTemplate,
} from "@authhero/adapter-interfaces";

export function set(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    template: UniversalLoginTemplate,
    options?: CreateOptions,
  ): Promise<void> => {
    const importMetadata = options?.importMetadata;
    const now = Date.now();
    const createdAt = importMetadata?.created_at
      ? new Date(importMetadata.created_at).getTime()
      : now;
    const updatedAt = importMetadata?.updated_at
      ? new Date(importMetadata.updated_at).getTime()
      : now;

    try {
      await db
        .insertInto("universal_login_templates")
        .values({
          tenant_id,
          body: template.body,
          created_at_ts: createdAt,
          updated_at_ts: updatedAt,
        })
        .execute();
    } catch (error) {
      await db
        .updateTable("universal_login_templates")
        .set({
          body: template.body,
          updated_at_ts: updatedAt,
        })
        .where("tenant_id", "=", tenant_id)
        .execute();
    }
  };
}
