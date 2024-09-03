import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import { Theme, ThemeInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, theme: ThemeInsert): Promise<Theme> => {
    const createdTheme = {
      themeId: nanoid(),
      ...theme,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db
      .insertInto("themes")
      .values({ ...flattenObject(createdTheme), tenant_id })
      .execute();

    return createdTheme;
  };
}
