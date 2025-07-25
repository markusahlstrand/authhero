import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("themes")
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("themeId", "varchar(255)", (col) => col.notNull())
    .addColumn("displayName", "varchar(255)", (col) => col.notNull())
    .addColumn("colors_primary_button_label", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("colors_primary_button", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_secondary_button_border", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("colors_secondary_button_label", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("colors_base_focus_color", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_base_hover_color", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_body_text", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_captcha_widget_theme", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("colors_error", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_header", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_icons", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_input_background", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_input_border", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_input_filled_text", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("colors_input_labels_placeholders", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("colors_links_focused_components", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("colors_success", "varchar(24)", (col) => col.notNull())
    .addColumn("colors_widget_background", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("colors_widget_border", "varchar(24)", (col) => col.notNull())
    .addColumn("borders_button_border_radius", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("borders_button_border_weight", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("borders_buttons_style", "varchar(24)", (col) => col.notNull())
    .addColumn("borders_input_border_radius", "integer", (col) => col.notNull())
    .addColumn("borders_input_border_weight", "integer", (col) => col.notNull())
    .addColumn("borders_inputs_style", "varchar(24)", (col) => col.notNull())
    .addColumn("borders_show_widget_shadow", "boolean", (col) => col.notNull())
    .addColumn("borders_widget_border_weight", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("borders_widget_corner_radius", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("fonts_body_text_bold", "integer", (col) => col.notNull())
    .addColumn("fonts_body_text_size", "integer", (col) => col.notNull())
    .addColumn("fonts_buttons_text_bold", "integer", (col) => col.notNull())
    .addColumn("fonts_buttons_text_size", "integer", (col) => col.notNull())
    .addColumn("fonts_font_url", "varchar(255)", (col) => col.notNull())
    .addColumn("fonts_input_labels_bold", "integer", (col) => col.notNull())
    .addColumn("fonts_input_labels_size", "integer", (col) => col.notNull())
    .addColumn("fonts_links_bold", "boolean", (col) => col.notNull())
    .addColumn("fonts_links_size", "integer", (col) => col.notNull())
    .addColumn("fonts_links_style", "varchar(24)", (col) => col.notNull())
    .addColumn("fonts_reference_text_size", "integer", (col) => col.notNull())
    .addColumn("fonts_subtitle_bold", "boolean", (col) => col.notNull())
    .addColumn("fonts_subtitle_size", "integer", (col) => col.notNull())
    .addColumn("fonts_title_bold", "boolean", (col) => col.notNull())
    .addColumn("fonts_title_size", "integer", (col) => col.notNull())
    .addColumn("page_background_background_color", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("page_background_background_image_url", "varchar(255)", (col) =>
      col.notNull(),
    )
    .addColumn("page_background_page_layout", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("widget_header_text_alignment", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("widget_logo_height", "integer", (col) => col.notNull())
    .addColumn("widget_logo_position", "varchar(24)", (col) => col.notNull())
    .addColumn("widget_logo_url", "varchar(255)", (col) => col.notNull())
    .addColumn("widget_social_buttons_layout", "varchar(24)", (col) =>
      col.notNull(),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("themes_pkey", ["tenant_id", "themeId"])
    .execute();

  await db.schema
    .createIndex("themes_tenant_id_idx")
    .on("themes")
    .column("tenant_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("themes").execute();
}
