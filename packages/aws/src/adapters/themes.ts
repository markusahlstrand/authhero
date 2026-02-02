import { nanoid } from "nanoid";
import {
  ThemesAdapter,
  Theme,
  ThemeInsert,
  themeSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { themeKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface ThemeItem extends DynamoDBBaseItem {
  themeId: string;
  tenant_id: string;
  displayName?: string;
  borders?: string; // JSON string
  colors?: string; // JSON string
  fonts?: string; // JSON string
  page_background?: string; // JSON string
  widget?: string; // JSON string
}

function toTheme(item: ThemeItem): Theme {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    borders: item.borders ? JSON.parse(item.borders) : undefined,
    colors: item.colors ? JSON.parse(item.colors) : undefined,
    fonts: item.fonts ? JSON.parse(item.fonts) : undefined,
    page_background: item.page_background
      ? JSON.parse(item.page_background)
      : undefined,
    widget: item.widget ? JSON.parse(item.widget) : undefined,
  });

  return themeSchema.parse(data);
}

export function createThemesAdapter(ctx: DynamoDBContext): ThemesAdapter {
  return {
    async create(
      tenantId: string,
      theme: ThemeInsert,
      providedThemeId?: string,
    ): Promise<Theme> {
      const now = new Date().toISOString();
      const themeId = providedThemeId || nanoid();

      const item: ThemeItem = {
        PK: themeKeys.pk(tenantId),
        SK: themeKeys.sk(themeId),
        entityType: "THEME",
        tenant_id: tenantId,
        themeId,
        displayName: theme.displayName,
        borders: theme.borders ? JSON.stringify(theme.borders) : undefined,
        colors: theme.colors ? JSON.stringify(theme.colors) : undefined,
        fonts: theme.fonts ? JSON.stringify(theme.fonts) : undefined,
        page_background: theme.page_background
          ? JSON.stringify(theme.page_background)
          : undefined,
        widget: theme.widget ? JSON.stringify(theme.widget) : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toTheme(item);
    },

    async get(tenantId: string, themeId: string): Promise<Theme | null> {
      const item = await getItem<ThemeItem>(
        ctx,
        themeKeys.pk(tenantId),
        themeKeys.sk(themeId),
      );

      if (!item) return null;

      return toTheme(item);
    },

    async update(
      tenantId: string,
      themeId: string,
      theme: Partial<ThemeInsert>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (theme.displayName !== undefined) {
        updates.displayName = theme.displayName;
      }
      if (theme.borders !== undefined) {
        updates.borders = JSON.stringify(theme.borders);
      }
      if (theme.colors !== undefined) {
        updates.colors = JSON.stringify(theme.colors);
      }
      if (theme.fonts !== undefined) {
        updates.fonts = JSON.stringify(theme.fonts);
      }
      if (theme.page_background !== undefined) {
        updates.page_background = JSON.stringify(theme.page_background);
      }
      if (theme.widget !== undefined) {
        updates.widget = JSON.stringify(theme.widget);
      }

      return updateItem(
        ctx,
        themeKeys.pk(tenantId),
        themeKeys.sk(themeId),
        updates,
      );
    },

    async remove(tenantId: string, themeId: string): Promise<boolean> {
      return deleteItem(ctx, themeKeys.pk(tenantId), themeKeys.sk(themeId));
    },
  };
}
