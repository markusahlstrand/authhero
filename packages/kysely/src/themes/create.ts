import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import {
  Theme,
  ThemeInsert,
  CreateOptions,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    theme: ThemeInsert,
    themeId?: string,
    options?: CreateOptions,
  ): Promise<Theme> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const createdTheme = {
      themeId: importMetadata?.id || themeId || nanoid(),
      ...theme,
      created_at: importMetadata?.created_at ?? now,
      updated_at: importMetadata?.updated_at ?? now,
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
