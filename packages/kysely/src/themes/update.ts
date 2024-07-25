import { Kysely } from "kysely";
import { ThemeInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { flattenObject } from "../flattten";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    themeId: string,
    theme: Partial<ThemeInsert>,
  ): Promise<boolean> => {
    const sqlTheme = flattenObject({
      ...theme,
      updated_at: new Date().toISOString(),
    });

    await db
      .updateTable("themes")
      .set(sqlTheme)
      .where("themes.id", "=", themeId)
      .where("themes.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
