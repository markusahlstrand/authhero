import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Theme } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { unflattenObject } from "../utils/flatten";

export function list(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<Theme[]> => {
    const themes = await db
      .selectFrom("themes")
      .where("themes.tenant_id", "=", tenant_id)
      .selectAll()
      .execute();

    return themes.map((theme) => {
      // `tenant_id` is a storage-only column; drop it so the returned Theme
      // matches the other adapters and never leaks into export payloads.
      const { tenant_id: _tenantId, ...rest } = theme;
      // Convert integer boolean fields from PlanetScale to actual booleans
      const convertedTheme = {
        ...rest,
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
    });
  };
}
