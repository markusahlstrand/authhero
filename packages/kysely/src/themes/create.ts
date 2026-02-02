import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import { Theme, ThemeInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    theme: ThemeInsert,
    themeId?: string,
  ): Promise<Theme> => {
    const createdTheme = {
      themeId: themeId || nanoid(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...theme,
    };

    // Map themeId to theme_id for database storage
    const dbValues = {
      ...createdTheme,
      tenant_id,
    };

    await db.insertInto("themes").values(flattenObject(dbValues)).execute();

    return createdTheme;
  };
}
