import { Theme } from "@authhero/adapter-interfaces";

export const DEFAULT_THEME: Theme = {
  themeId: "default",
  borders: {
    button_border_radius: 8,
    button_border_weight: 1,
    buttons_style: "pill",
    input_border_radius: 8,
    input_border_weight: 1,
    inputs_style: "pill",
    show_widget_shadow: true,
    widget_border_weight: 1,
    widget_corner_radius: 16,
  },
  colors: {
    base_focus_color: "#7D68F4",
    base_hover_color: "#A091F2",
    body_text: "#000000",
    captcha_widget_theme: "auto",
    error: "#FC5A5A",
    header: "#000000",
    icons: "#666666",
    input_background: "#FFFFFF",
    input_border: "#BFBCD7",
    input_filled_text: "#000000",
    input_labels_placeholders: "#88869F",
    links_focused_components: "#7D68F4",
    primary_button: "#7D68F4",
    primary_button_label: "#FFFFFF",
    secondary_button_border: "#BFBCD7",
    secondary_button_label: "#000000",
    success: "#36BF76",
    widget_background: "#FFFFFF",
    widget_border: "#BFBCD7",
  },
  displayName: "Default Theme",
  fonts: {
    body_text: {
      bold: false,
      size: 100,
    },
    buttons_text: {
      bold: true,
      size: 100,
    },
    font_url:
      "https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Regular.woff2",
    input_labels: {
      bold: false,
      size: 100,
    },
    links: {
      bold: true,
      size: 100,
    },
    links_style: "normal",
    reference_text_size: 16,
    subtitle: {
      bold: false,
      size: 100,
    },
    title: {
      bold: true,
      size: 150,
    },
  },
  page_background: {
    background_color: "#F8F9FB",
    background_image_url: "",
    page_layout: "center",
  },
  widget: {
    logo_url: "",
    header_text_alignment: "center",
    logo_height: 36,
    logo_position: "center",
    social_buttons_layout: "bottom",
  },
};
