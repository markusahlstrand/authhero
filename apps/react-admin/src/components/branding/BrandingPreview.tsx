import { useEffect, useRef } from "react";
import { useWatch } from "react-hook-form";
import {
  Box,
  Typography,
  Paper,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { useState } from "react";
import { defineCustomElements } from "@authhero/widget/loader";

// Initialize the widget custom elements with CDN path for assets
if (typeof window !== "undefined") {
  defineCustomElements(window, {
    resourcesUrl: "https://unpkg.com/@authhero/widget@latest/dist/authhero-widget/",
  });
}

// Types for the widget screen configuration
interface FormComponent {
  id: string;
  type: string;
  category: "FIELD" | "BLOCK" | "WIDGET";
  visible: boolean;
  label?: string;
  config?: Record<string, unknown>;
  required?: boolean;
  sensitive?: boolean;
  order: number;
  messages?: Array<{ text: string; type: "error" | "success" }>;
}

interface ScreenLink {
  id?: string;
  text: string;
  linkText?: string;
  href: string;
}

interface UiScreen {
  action: string;
  method: string;
  title?: string;
  description?: string;
  components: FormComponent[];
  links?: ScreenLink[];
  messages?: Array<{ text: string; type: "error" | "success" }>;
}

// Sample screen to preview
const sampleScreen: UiScreen = {
  action: "#",
  method: "POST",
  title: "Welcome",
  description: "Sign in to continue",
  components: [
    {
      id: "social-buttons",
      type: "SOCIAL",
      category: "FIELD",
      visible: true,
      config: {
        providers: ["google-oauth2"],
      },
      order: 0,
    },
    {
      id: "divider",
      type: "DIVIDER",
      category: "BLOCK",
      visible: true,
      order: 1,
    },
    {
      id: "username",
      type: "EMAIL",
      category: "FIELD",
      visible: true,
      label: "Email address",
      config: {
        placeholder: "name@example.com",
      },
      required: true,
      order: 2,
    },
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Continue",
      },
      order: 3,
    },
  ],
  links: [
    {
      id: "signup",
      text: "Don't have an account?",
      linkText: "Sign up",
      href: "#",
    },
  ],
};

type PreviewScreen = "login" | "signup" | "password";

const screenConfigs: Record<PreviewScreen, UiScreen> = {
  login: sampleScreen,
  signup: {
    ...sampleScreen,
    title: "Create account",
    description: "Sign up to get started",
    components: [
      ...sampleScreen.components.slice(0, 3),
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: "Password",
        config: {
          placeholder: "Enter your password",
        },
        required: true,
        sensitive: true,
        order: 3,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Sign up",
        },
        order: 4,
      },
    ],
    links: [
      {
        id: "login",
        text: "Already have an account?",
        linkText: "Sign in",
        href: "#",
      },
    ],
  },
  password: {
    action: "#",
    method: "POST",
    title: "Enter your password",
    components: [
      {
        id: "email-display",
        type: "RICH_TEXT",
        category: "BLOCK",
        visible: true,
        config: {
          content: "Signing in as <strong>user@example.com</strong>",
        },
        order: 0,
      },
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: "Password",
        config: {
          placeholder: "Enter your password",
        },
        required: true,
        sensitive: true,
        order: 1,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Continue",
        },
        order: 2,
      },
    ],
    links: [
      {
        id: "forgot",
        text: "Forgot your password?",
        linkText: "Reset it",
        href: "#",
      },
    ],
  },
};

interface WidgetBranding {
  colors?: {
    primary?: string;
    page_background?:
      | {
          type?: string;
          start?: string;
          end?: string;
          angle_deg?: number;
        }
      | string;
  };
  logo_url?: string;
  favicon_url?: string;
  font?: {
    url?: string;
  };
}

interface WidgetTheme {
  borders?: {
    button_border_radius?: number;
    button_border_weight?: number;
    buttons_style?: "pill" | "rounded" | "sharp";
    input_border_radius?: number;
    input_border_weight?: number;
    inputs_style?: "pill" | "rounded" | "sharp";
    show_widget_shadow?: boolean;
    widget_border_weight?: number;
    widget_corner_radius?: number;
  };
  colors?: {
    base_focus_color?: string;
    base_hover_color?: string;
    body_text?: string;
    error?: string;
    header?: string;
    icons?: string;
    input_background?: string;
    input_border?: string;
    input_filled_text?: string;
    input_labels_placeholders?: string;
    links_focused_components?: string;
    primary_button?: string;
    primary_button_label?: string;
    secondary_button_border?: string;
    secondary_button_label?: string;
    success?: string;
    widget_background?: string;
    widget_border?: string;
  };
  fonts?: {
    body_text?: { bold?: boolean; size?: number };
    buttons_text?: { bold?: boolean; size?: number };
    font_url?: string;
    input_labels?: { bold?: boolean; size?: number };
    links?: { bold?: boolean; size?: number };
    links_style?: "normal" | "underlined";
    reference_text_size?: number;
    subtitle?: { bold?: boolean; size?: number };
    title?: { bold?: boolean; size?: number };
  };
  page_background?: {
    background_color?: string;
    background_image_url?: string;
    page_layout?: "center" | "left" | "right";
  };
  widget?: {
    header_text_alignment?: "center" | "left" | "right";
    logo_height?: number;
    logo_position?: "center" | "left" | "none" | "right";
    logo_url?: string;
    social_buttons_layout?: "bottom" | "top";
  };
}

export function BrandingPreview() {
  const widgetRef = useRef<HTMLElement>(null);
  const [previewScreen, setPreviewScreen] = useState<PreviewScreen>("login");

  // Watch for form changes
  const colors = useWatch({ name: "colors" });
  const logoUrl = useWatch({ name: "logo_url" });
  const faviconUrl = useWatch({ name: "favicon_url" });
  const font = useWatch({ name: "font" });
  const themes = useWatch({ name: "themes" });

  // Convert form values to widget branding format
  const branding: WidgetBranding = {
    colors: {
      primary: colors?.primary,
      page_background:
        typeof colors?.page_background === "string"
          ? { type: "solid", start: colors.page_background }
          : colors?.page_background,
    },
    logo_url: logoUrl,
    favicon_url: faviconUrl,
    font: font,
  };

  // Convert themes to widget theme format
  const theme: WidgetTheme | undefined = themes
    ? {
        borders: themes.borders,
        colors: themes.colors,
        fonts: themes.fonts,
        page_background: themes.page_background,
        widget: themes.widget,
      }
    : undefined;

  // Get background style for the preview container
  const getBackgroundStyle = () => {
    // Check theme page_background first
    if (theme?.page_background?.background_color) {
      return { background: theme.page_background.background_color };
    }

    // Fall back to branding page_background
    const bg = branding.colors?.page_background;
    if (!bg) return { background: "#f5f5f5" };

    if (typeof bg === "string") {
      return { background: bg };
    }

    if (bg.type === "linear-gradient" && bg.start && bg.end) {
      const angle = bg.angle_deg ?? 180;
      return {
        background: `linear-gradient(${angle}deg, ${bg.start}, ${bg.end})`,
      };
    }

    if (bg.start) {
      return { background: bg.start };
    }

    return { background: "#f5f5f5" };
  };

  // Update widget props when values change
  useEffect(() => {
    if (widgetRef.current) {
      const widget = widgetRef.current.querySelector(
        "authhero-widget",
      ) as HTMLElement & {
        screen?: UiScreen;
        branding?: WidgetBranding;
        theme?: WidgetTheme;
      };
      if (widget) {
        widget.screen = screenConfigs[previewScreen];
        widget.branding = branding;
        if (theme) {
          widget.theme = theme;
        }
      }
    }
  }, [branding, theme, previewScreen]);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "grey.100",
        borderRadius: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          Preview
        </Typography>
        <ToggleButtonGroup
          size="small"
          value={previewScreen}
          exclusive
          onChange={(_, value) => value && setPreviewScreen(value)}
        >
          <ToggleButton value="login">Login</ToggleButton>
          <ToggleButton value="password">Password</ToggleButton>
          <ToggleButton value="signup">Signup</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box
        sx={{
          flex: 1,
          borderRadius: 1,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 500,
          ...getBackgroundStyle(),
        }}
      >
        {/* Using dangerouslySetInnerHTML to bypass JSX type issues with web components */}
        <div
          ref={widgetRef as React.RefObject<HTMLDivElement>}
          dangerouslySetInnerHTML={{
            __html: `<authhero-widget
              screen='${JSON.stringify(screenConfigs[previewScreen]).replace(/'/g, "&apos;")}'
              branding='${JSON.stringify(branding).replace(/'/g, "&apos;")}'
              ${theme ? `theme='${JSON.stringify(theme).replace(/'/g, "&apos;")}'` : ""}
            ></authhero-widget>`,
          }}
        />
      </Box>
    </Paper>
  );
}
