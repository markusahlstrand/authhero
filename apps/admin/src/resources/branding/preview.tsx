import { useEffect, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { useNotify } from "ra-core";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenantId } from "@/TenantContext";
import { openFullPreview } from "./previewClient";

const WIDGET_VERSION = "0.32.14";
const WIDGET_SRC = `https://unpkg.com/@authhero/widget@${WIDGET_VERSION}/dist/authhero-widget/authhero-widget.esm.js`;

if (
  typeof window !== "undefined" &&
  !document.querySelector(`script[data-authhero-widget]`)
) {
  const s = document.createElement("script");
  s.type = "module";
  s.src = WIDGET_SRC;
  s.dataset.authheroWidget = "true";
  document.head.appendChild(s);
}

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
      config: { providers: ["google-oauth2"] },
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
      config: { placeholder: "name@example.com" },
      required: true,
      order: 2,
    },
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: { text: "Continue" },
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
        config: { placeholder: "Enter your password" },
        required: true,
        sensitive: true,
        order: 3,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: { text: "Sign up" },
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
    description: "Signing in as <strong>user@example.com</strong>",
    components: [
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: "Password",
        config: { placeholder: "Enter your password" },
        required: true,
        sensitive: true,
        order: 0,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: { text: "Continue" },
        order: 1,
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

interface PageBackgroundObject {
  type?: string;
  start?: string;
  end?: string;
  angle_deg?: number;
}

interface WidgetBranding {
  colors?: {
    primary?: string;
    page_background?: PageBackgroundObject | string;
  };
  logo_url?: string;
  favicon_url?: string;
  font?: { url?: string };
}

interface WidgetTheme {
  borders?: Record<string, unknown>;
  colors?: Record<string, unknown>;
  fonts?: Record<string, unknown>;
  page_background?: {
    background_color?: string;
    background_image_url?: string;
    page_layout?: "center" | "left" | "right";
    logo_placement?: "widget" | "chip" | "none";
  };
  widget?: Record<string, unknown>;
}

interface WidgetElement extends HTMLElement {
  screen?: UiScreen;
  branding?: WidgetBranding;
  theme?: WidgetTheme;
}

function isPageBackgroundObject(v: unknown): v is PageBackgroundObject {
  return typeof v === "object" && v !== null;
}

export function BrandingPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewScreen, setPreviewScreen] = useState<PreviewScreen>("login");
  const tenantId = useTenantId() ?? "";
  const notify = useNotify();

  const colors = useWatch({ name: "colors" }) as
    | { primary?: string; page_background?: PageBackgroundObject | string }
    | undefined;
  const logoUrl = useWatch({ name: "logo_url" }) as string | undefined;
  const faviconUrl = useWatch({ name: "favicon_url" }) as string | undefined;
  const font = useWatch({ name: "font" }) as { url?: string } | undefined;
  const themes = useWatch({ name: "themes" }) as WidgetTheme | undefined;

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

  const theme: WidgetTheme | undefined = themes
    ? {
        borders: themes.borders,
        colors: themes.colors,
        fonts: themes.fonts,
        page_background: themes.page_background,
        widget: themes.widget,
      }
    : undefined;

  const getBackgroundStyle = (): React.CSSProperties => {
    if (theme?.page_background?.background_color) {
      return { background: theme.page_background.background_color };
    }
    const bg = branding.colors?.page_background;
    if (!bg) return { background: "#f5f5f5" };
    if (typeof bg === "string") return { background: bg };
    if (
      isPageBackgroundObject(bg) &&
      bg.type === "linear-gradient" &&
      bg.start &&
      bg.end
    ) {
      const angle = bg.angle_deg ?? 180;
      return {
        background: `linear-gradient(${angle}deg, ${bg.start}, ${bg.end})`,
      };
    }
    if (isPageBackgroundObject(bg) && bg.start) return { background: bg.start };
    return { background: "#f5f5f5" };
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const widget = containerRef.current.querySelector(
      "authhero-widget",
    ) as WidgetElement | null;
    if (widget) {
      widget.screen = screenConfigs[previewScreen];
      widget.branding = branding;
      if (theme) widget.theme = theme;
    }
  }, [branding, theme, previewScreen]);

  const handleOpenFull = async () => {
    if (!tenantId) return;
    try {
      await openFullPreview({
        tenantId,
        screen: previewScreen,
        branding,
        theme,
      });
    } catch {
      notify("Failed to open preview", { type: "error" });
    }
  };

  const screenJson = JSON.stringify(screenConfigs[previewScreen]).replace(
    /'/g,
    "&apos;",
  );
  const brandingJson = JSON.stringify(branding).replace(/'/g, "&apos;");
  const themeJson = theme
    ? JSON.stringify(theme).replace(/'/g, "&apos;")
    : null;

  return (
    <div className="flex h-full flex-col gap-2 rounded-lg bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleOpenFull}
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          title="Open the full-size login page in a new tab"
        >
          Preview
          <ExternalLink className="size-3" />
        </Button>
        <div className="flex gap-1">
          {(["login", "password", "signup"] as PreviewScreen[]).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={previewScreen === s ? "default" : "outline"}
              onClick={() => setPreviewScreen(s)}
              className="h-7 px-2 text-xs capitalize"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div
        className="flex flex-1 items-center justify-center overflow-hidden rounded-md"
        style={getBackgroundStyle()}
      >
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{
            __html: `<authhero-widget
              screen='${screenJson}'
              branding='${brandingJson}'
              ${themeJson ? `theme='${themeJson}'` : ""}
            ></authhero-widget>`,
          }}
        />
      </div>
    </div>
  );
}
