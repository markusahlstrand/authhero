import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Theme } from "@authhero/adapter-interfaces";
import { themes } from "../schema/sqlite";
import {
  removeNullProperties,
  flattenObject,
  unflattenObject,
} from "../helpers/transform";
import type { DrizzleDb } from "./types";

const UNFLATTEN_PREFIXES = [
  "colors",
  "borders",
  "fonts",
  "page_background",
  "widget",
];

function sqlToTheme(row: any): Theme {
  const { tenant_id: _, ...rest } = row;
  const unflattened = unflattenObject(rest, UNFLATTEN_PREFIXES);

  // Convert integer booleans in nested objects
  if (unflattened.borders) {
    unflattened.borders.show_widget_shadow = !!unflattened.borders.show_widget_shadow;
  }
  if (unflattened.fonts) {
    unflattened.fonts.links_bold = !!unflattened.fonts.links_bold;
    unflattened.fonts.subtitle_bold = !!unflattened.fonts.subtitle_bold;
    unflattened.fonts.title_bold = !!unflattened.fonts.title_bold;
  }

  return removeNullProperties(unflattened) as Theme;
}

export function createThemesAdapter(db: DrizzleDb) {
  return {
    async create(
      tenant_id: string,
      theme: any,
      themeId?: string,
    ): Promise<Theme> {
      const now = new Date().toISOString();
      const id = themeId || nanoid();

      const flattened = flattenObject(theme);
      const values = {
        ...flattened,
        tenant_id,
        themeId: id,
        created_at: now,
        updated_at: now,
      };

      await db.insert(themes).values(values as any);

      return sqlToTheme({ ...values, tenant_id });
    },

    async get(tenant_id: string, themeId: string): Promise<Theme | null> {
      const result = await db
        .select()
        .from(themes)
        .where(
          and(eq(themes.tenant_id, tenant_id), eq(themes.themeId, themeId)),
        )
        .get();

      if (!result) return null;
      return sqlToTheme(result);
    },

    async update(
      tenant_id: string,
      themeId: string,
      params: Partial<Theme>,
    ): Promise<boolean> {
      const flattened = flattenObject(params);
      flattened.updated_at = new Date().toISOString();

      await db
        .update(themes)
        .set(flattened as any)
        .where(
          and(eq(themes.tenant_id, tenant_id), eq(themes.themeId, themeId)),
        );

      return true;
    },

    async remove(tenant_id: string, themeId: string): Promise<boolean> {
      const results = await db
        .delete(themes)
        .where(
          and(eq(themes.tenant_id, tenant_id), eq(themes.themeId, themeId)),
        )
        .returning();

      return results.length > 0;
    },
  };
}
