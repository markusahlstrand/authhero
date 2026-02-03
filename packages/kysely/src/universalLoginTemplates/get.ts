import { Kysely } from "kysely";
import { Database } from "../db";
import { UniversalLoginTemplate } from "@authhero/adapter-interfaces";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<UniversalLoginTemplate | null> => {
    const result = await db
      .selectFrom("universal_login_templates")
      .select(["body"])
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return {
      body: result.body,
    };
  };
}
