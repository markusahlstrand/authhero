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

    // Convert integer boolean fields from PlanetScale to actual booleans
    const convertedTheme = {
      ...theme,
      borders_show_widget_shadow: Boolean(theme.borders_show_widget_shadow),
      fonts_body_text_bold: Boolean(theme.fonts_body_text_bold),
      fonts_buttons_text_bold: Boolean(theme.fonts_buttons_text_bold),
      fonts_input_labels_bold: Boolean(theme.fonts_input_labels_bold),
      fonts_links_bold: Boolean(theme.fonts_links_bold),
      fonts_subtitle_bold: Boolean(theme.fonts_subtitle_bold),
      fonts_title_bold: Boolean(theme.fonts_title_bold),
    };

    return removeNullProperties(
      unflattenObject(convertedTheme, [
        "widget",
        "colors",
        "borders",
        "fonts",
        "page_background",
      ]),
    );
  };
}
