import { z } from "@hono/zod-openapi";

export const bordersSchema = z.object({
  button_border_radius: z.number(),
  button_border_weight: z.number(),
  buttons_style: z.enum(["pill"]),
  input_border_radius: z.number(),
  input_border_weight: z.number(),
  inputs_style: z.enum(["pill"]),
  show_widget_shadow: z.boolean(),
  widget_border_weight: z.number(),
  widget_corner_radius: z.number(),
});

export const colorsSchema = z.object({
  base_focus_color: z.string(),
  base_hover_color: z.string(),
  body_text: z.string(),
  captcha_widget_theme: z.enum(["auto"]),
  error: z.string(),
  header: z.string(),
  icons: z.string(),
  input_background: z.string(),
  input_border: z.string(),
  input_filled_text: z.string(),
  input_labels_placeholders: z.string(),
  links_focused_components: z.string(),
  primary_button: z.string(),
  primary_button_label: z.string(),
  secondary_button_border: z.string(),
  secondary_button_label: z.string(),
  success: z.string(),
  widget_background: z.string(),
  widget_border: z.string(),
});

export const fontDetailsSchema = z.object({
  bold: z.boolean(),
  size: z.number(),
});

export const fontsSchema = z.object({
  body_text: fontDetailsSchema,
  buttons_text: fontDetailsSchema,
  font_url: z.string(),
  input_labels: fontDetailsSchema,
  links: fontDetailsSchema,
  links_style: z.enum(["normal"]),
  reference_text_size: z.number(),
  subtitle: fontDetailsSchema,
  title: fontDetailsSchema,
});

export const pageBackgroundSchema = z.object({
  background_color: z.string(),
  background_image_url: z.string(),
  page_layout: z.enum(["center"]),
});

export const widgetSchema = z.object({
  header_text_alignment: z.enum(["center"]),
  logo_height: z.number(),
  logo_position: z.enum(["center"]),
  logo_url: z.string(),
  social_buttons_layout: z.enum(["bottom"]),
});

export const themeInsertSchema = z.object({
  borders: bordersSchema,
  colors: colorsSchema,
  displayName: z.string(),
  fonts: fontsSchema,
  page_background: pageBackgroundSchema,
  widget: widgetSchema,
});

export type ThemeInsert = z.infer<typeof themeInsertSchema>;

export const themeSchema = themeInsertSchema.extend({
  themeId: z.string(),
});

export type Theme = z.infer<typeof themeSchema>;
