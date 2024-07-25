import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Theme } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, themeId: string): Promise<Theme | null> => {
    const connection = await db
      .selectFrom("themes")
      .where("themes.tenant_id", "=", tenant_id)
      .where("themes.theme_id", "=", themeId)
      .selectAll()
      .executeTakeFirst();

    if (!connection) {
      return null;
    }

    return removeNullProperties(connection);
  };
}
