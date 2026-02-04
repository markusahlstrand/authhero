import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";
import { connections } from "./connections";

export const branding = sqliteTable("branding", {
  tenant_id: text("tenant_id", { length: 191 })
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  logo_url: text("logo_url", { length: 512 }),
  favicon_url: text("favicon_url", { length: 512 }),
  font_url: text("font_url", { length: 512 }),
  colors_primary: text("colors_primary", { length: 8 }),
  colors_page_background_type: text("colors_page_background_type", {
    length: 32,
  }),
  colors_page_background_start: text("colors_page_background_start", {
    length: 8,
  }),
  colors_page_background_end: text("colors_page_background_end", { length: 8 }),
  colors_page_background_angle_dev: integer("colors_page_background_angle_dev"),
});

export const universalLoginTemplates = sqliteTable("universal_login_templates", {
  tenant_id: text("tenant_id", { length: 191 })
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  created_at_ts: integer("created_at_ts").notNull(),
  updated_at_ts: integer("updated_at_ts").notNull(),
});

export const themes = sqliteTable(
  "themes",
  {
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    themeId: text("themeId", { length: 255 }).notNull(),
    displayName: text("displayName", { length: 255 }).notNull(),
    colors_primary_button_label: text("colors_primary_button_label", {
      length: 24,
    }).notNull(),
    colors_primary_button: text("colors_primary_button", {
      length: 24,
    }).notNull(),
    colors_secondary_button_border: text("colors_secondary_button_border", {
      length: 24,
    }).notNull(),
    colors_secondary_button_label: text("colors_secondary_button_label", {
      length: 24,
    }).notNull(),
    colors_base_focus_color: text("colors_base_focus_color", {
      length: 24,
    }).notNull(),
    colors_base_hover_color: text("colors_base_hover_color", {
      length: 24,
    }).notNull(),
    colors_body_text: text("colors_body_text", { length: 24 }).notNull(),
    colors_captcha_widget_theme: text("colors_captcha_widget_theme", {
      length: 24,
    }).notNull(),
    colors_error: text("colors_error", { length: 24 }).notNull(),
    colors_header: text("colors_header", { length: 24 }).notNull(),
    colors_icons: text("colors_icons", { length: 24 }).notNull(),
    colors_input_background: text("colors_input_background", {
      length: 24,
    }).notNull(),
    colors_input_border: text("colors_input_border", { length: 24 }).notNull(),
    colors_input_filled_text: text("colors_input_filled_text", {
      length: 24,
    }).notNull(),
    colors_input_labels_placeholders: text("colors_input_labels_placeholders", {
      length: 24,
    }).notNull(),
    colors_links_focused_components: text("colors_links_focused_components", {
      length: 24,
    }).notNull(),
    colors_success: text("colors_success", { length: 24 }).notNull(),
    colors_widget_background: text("colors_widget_background", {
      length: 24,
    }).notNull(),
    colors_widget_border: text("colors_widget_border", {
      length: 24,
    }).notNull(),
    borders_button_border_radius: integer(
      "borders_button_border_radius",
    ).notNull(),
    borders_button_border_weight: integer(
      "borders_button_border_weight",
    ).notNull(),
    borders_buttons_style: text("borders_buttons_style", {
      length: 24,
    }).notNull(),
    borders_input_border_radius: integer(
      "borders_input_border_radius",
    ).notNull(),
    borders_input_border_weight: integer(
      "borders_input_border_weight",
    ).notNull(),
    borders_inputs_style: text("borders_inputs_style", {
      length: 24,
    }).notNull(),
    borders_show_widget_shadow: integer("borders_show_widget_shadow", {
      mode: "boolean",
    }).notNull(),
    borders_widget_border_weight: integer(
      "borders_widget_border_weight",
    ).notNull(),
    borders_widget_corner_radius: integer(
      "borders_widget_corner_radius",
    ).notNull(),
    fonts_body_text_bold: integer("fonts_body_text_bold").notNull(),
    fonts_body_text_size: integer("fonts_body_text_size").notNull(),
    fonts_buttons_text_bold: integer("fonts_buttons_text_bold").notNull(),
    fonts_buttons_text_size: integer("fonts_buttons_text_size").notNull(),
    fonts_font_url: text("fonts_font_url", { length: 255 }).notNull(),
    fonts_input_labels_bold: integer("fonts_input_labels_bold").notNull(),
    fonts_input_labels_size: integer("fonts_input_labels_size").notNull(),
    fonts_links_bold: integer("fonts_links_bold", {
      mode: "boolean",
    }).notNull(),
    fonts_links_size: integer("fonts_links_size").notNull(),
    fonts_links_style: text("fonts_links_style", { length: 24 }).notNull(),
    fonts_reference_text_size: integer("fonts_reference_text_size").notNull(),
    fonts_subtitle_bold: integer("fonts_subtitle_bold", {
      mode: "boolean",
    }).notNull(),
    fonts_subtitle_size: integer("fonts_subtitle_size").notNull(),
    fonts_title_bold: integer("fonts_title_bold", {
      mode: "boolean",
    }).notNull(),
    fonts_title_size: integer("fonts_title_size").notNull(),
    page_background_background_color: text("page_background_background_color", {
      length: 24,
    }).notNull(),
    page_background_background_image_url: text(
      "page_background_background_image_url",
      { length: 255 },
    ).notNull(),
    page_background_page_layout: text("page_background_page_layout", {
      length: 24,
    }).notNull(),
    widget_header_text_alignment: text("widget_header_text_alignment", {
      length: 24,
    }).notNull(),
    widget_logo_height: integer("widget_logo_height").notNull(),
    widget_logo_position: text("widget_logo_position", {
      length: 24,
    }).notNull(),
    widget_logo_url: text("widget_logo_url", { length: 255 }).notNull(),
    widget_social_buttons_layout: text("widget_social_buttons_layout", {
      length: 24,
    }).notNull(),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.themeId],
      name: "themes_pkey",
    }),
    index("themes_tenant_id_idx").on(table.tenant_id),
  ],
);

export const forms = sqliteTable(
  "forms",
  {
    id: text("id", { length: 255 }).primaryKey(),
    name: text("name", { length: 255 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    messages: text("messages", { length: 255 }),
    languages: text("languages", { length: 255 }),
    translations: text("translations", { length: 4096 }),
    nodes: text("nodes", { length: 4096 }),
    start: text("start", { length: 255 }),
    ending: text("ending", { length: 255 }),
    style: text("style", { length: 1042 }),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
  },
  (table) => [index("forms_tenant_id_idx").on(table.tenant_id)],
);

export const flows = sqliteTable(
  "flows",
  {
    id: text("id", { length: 24 }).primaryKey(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name", { length: 150 }).notNull(),
    actions: text("actions"),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
  },
  (table) => [index("flows_tenant_id_idx").on(table.tenant_id)],
);

export const promptSettings = sqliteTable("prompt_settings", {
  tenant_id: text("tenant_id", { length: 191 }).primaryKey(),
  universal_login_experience: text("universal_login_experience", { length: 16 })
    .notNull()
    .default("new"),
  identifier_first: integer("identifier_first", { mode: "boolean" })
    .notNull()
    .default(true),
  password_first: integer("password_first", { mode: "boolean" })
    .notNull()
    .default(false),
  webauthn_platform_first_factor: integer("webauthn_platform_first_factor", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
});

export const emailProviders = sqliteTable("email_providers", {
  tenant_id: text("tenant_id", { length: 191 }).primaryKey(),
  name: text("name", { length: 255 }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  default_from_address: text("default_from_address", { length: 255 }),
  credentials: text("credentials", { length: 2048 }).notNull().default("{}"),
  settings: text("settings", { length: 2048 }).notNull().default("{}"),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
});

export const hooks = sqliteTable("hooks", {
  hook_id: text("hook_id", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  url: text("url", { length: 512 }).notNull(),
  trigger_id: text("trigger_id", { length: 255 }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
  synchronous: integer("synchronous", { mode: "boolean" })
    .notNull()
    .default(false),
  priority: integer("priority"),
  form_id: text("form_id"),
  url_tmp: text("url_tmp", { length: 512 }),
});

export const keys = sqliteTable("keys", {
  kid: text("kid", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 }).references(() => tenants.id, {
    onDelete: "cascade",
  }),
  created_at: text("created_at", { length: 35 }).notNull(),
  revoked_at: text("revoked_at", { length: 35 }),
  cert: text("cert", { length: 4096 }),
  pkcs7: text("pkcs7", { length: 4096 }),
  fingerprint: text("fingerprint", { length: 256 }),
  thumbprint: text("thumbprint", { length: 256 }),
  current_since: text("current_since", { length: 35 }),
  current_until: text("current_until", { length: 35 }),
  type: text("type", { length: 50 }).notNull().default("jwt_signing"),
  connection: text("connection", { length: 255 }).references(
    () => connections.id,
    { onDelete: "cascade" },
  ),
});

export const customText = sqliteTable(
  "custom_text",
  {
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    prompt: text("prompt", { length: 64 }).notNull(),
    language: text("language", { length: 16 }).notNull(),
    custom_text: text("custom_text").notNull(),
    created_at_ts: integer("created_at_ts").notNull(),
    updated_at_ts: integer("updated_at_ts").notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenant_id, table.prompt, table.language] })],
);
