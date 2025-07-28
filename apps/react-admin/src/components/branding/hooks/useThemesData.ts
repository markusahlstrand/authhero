import { useState, useEffect } from "react";
import { useDataProvider, useNotify } from "react-admin";

export interface ThemeData {
  displayName: string;
  colors: {
    primary_button?: string;
    primary_button_label?: string;
    secondary_button_border?: string;
    secondary_button_label?: string;
    base_focus_color?: string;
    base_hover_color?: string;
    body_text?: string;
    captcha_widget_theme?: string;
    error?: string;
    header?: string;
    icons?: string;
    input_background?: string;
    input_border?: string;
    input_filled_text?: string;
    input_labels_placeholders?: string;
    links_focused_components?: string;
    success?: string;
    widget_background?: string;
    widget_border?: string;
  };
  borders: {
    button_border_radius?: number;
    button_border_weight?: number;
    buttons_style?: string;
    input_border_radius?: number;
    input_border_weight?: number;
    inputs_style?: string;
    show_widget_shadow?: boolean;
    widget_border_weight?: number;
    widget_corner_radius?: number;
  };
  fonts: {
    font_url?: string;
    reference_text_size?: number;
    body_text?: { bold?: boolean; size?: number };
    buttons_text?: { bold?: boolean; size?: number };
    input_labels?: { bold?: boolean; size?: number };
    links?: { bold?: boolean; size?: number };
    links_style?: string;
    subtitle?: { bold?: boolean; size?: number };
    title?: { bold?: boolean; size?: number };
  };
  page_background: {
    background_color?: string;
    background_image_url?: string;
    page_layout?: string;
  };
  widget: {
    header_text_alignment?: string;
    logo_height?: number;
    logo_position?: string;
    logo_url?: string;
    social_buttons_layout?: string;
  };
}

export function useThemesData() {
  const [themeData, setThemeData] = useState<ThemeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const fetchThemes = async () => {
    try {
      setLoading(true);
      const response = await dataProvider.getOne("branding/themes/default", {
        id: "default",
      });
      setThemeData(response.data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch themes:", err);
      setError("Failed to fetch themes");
      // Initialize with empty structure if fetch fails
      setThemeData({
        displayName: "",
        colors: {},
        borders: {},
        fonts: {},
        page_background: {},
        widget: {},
      });
    } finally {
      setLoading(false);
    }
  };

  const updateThemes = async (data: Partial<ThemeData>) => {
    try {
      const response = await dataProvider.update("branding/themes/default", {
        id: "default",
        data,
        previousData: themeData,
      });
      setThemeData(response.data);
      notify("Theme updated successfully", { type: "success" });
      return response.data;
    } catch (err) {
      console.error("Failed to update themes:", err);
      notify("Failed to update theme", { type: "error" });
      throw err;
    }
  };

  useEffect(() => {
    fetchThemes();
  }, []);

  return {
    themeData,
    loading,
    error,
    updateThemes,
    refetch: fetchThemes,
  };
}
