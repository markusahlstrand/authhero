import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, themeId: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("themes")
      .where("themes.tenant_id", "=", tenant_id)
      .where("themes.themeId", "=", themeId)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
