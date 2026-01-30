import { Kysely } from "kysely";
import { Database } from "../db";

export function getUniversalLoginTemplate(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<string | null> => {
    const result = await db
      .selectFrom("universal_login_templates")
      .select("template")
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    return result?.template ?? null;
  };
}
