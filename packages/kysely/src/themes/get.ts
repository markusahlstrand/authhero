import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Theme } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { unflattenObject } from "../utils/flatten";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, themeId: string): Promise<Theme | null> => {
    const theme = await db
      .selectFrom("themes")
      .where("themes.tenant_id", "=", tenant_id)
      .where("themes.themeId", "=", themeId)
      .selectAll()
      .executeTakeFirst();

    if (!theme) {
      return null;
    }

    return removeNullProperties(
      unflattenObject(theme, [
        "widget",
        "colors",
        "borders",
        "fonts",
        "page_background",
      ]),
    );
  };
}
