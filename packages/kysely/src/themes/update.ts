import { Kysely } from "kysely";
import { ThemeInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    themeId: string,
    theme: Partial<ThemeInsert>,
  ): Promise<boolean> => {
    // Remove themeId if present - it shouldn't be updated as it's part of the primary key
    const { themeId: _, ...themeWithoutId } = theme as any;

    const sqlTheme = flattenObject({
      ...themeWithoutId,
      updated_at: new Date().toISOString(),
    });

    await db
      .updateTable("themes")
      .set(sqlTheme)
      .where("themes.themeId", "=", themeId)
      .where("themes.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
