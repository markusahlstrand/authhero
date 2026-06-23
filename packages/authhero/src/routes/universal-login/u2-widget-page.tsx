/**
 * Shared widget page rendering for U2 routes.
 *
 * v3 — Logo inside widget by default + adaptive chip chrome.
 *
 * Changes vs. v2:
 *  - Logo renders INSIDE the widget card by default (Auth0-style). The
 *    widget's own shadow DOM emits the logo from `branding.logo_url`, so
 *    the page doesn't add an outer-container duplicate. Set
 *    `logoPosition="chip"` to render the floating-chip variant instead.
 *  - Chips adapt to dark/light page mode (translucent dark vs. translucent
 *    white). Tokens are CSS variables flipped via a `data-mode` attribute,
 *    so a single ruleset handles both directions.
 *  - When there's no background image, chips drop their pill surface and
 *    render as plain text (matches a clean solid-bg layout).
 *  - Privacy/Terms is now a real chip in the with-image case so it doesn't
 *    float as orphan text.
 *
 *   ┌─────────────────────────────────────┐
 *   │ [logo*]                 [settings]  │   *only when logoPosition=chip
 *   │                                     │
 *   │            ┌──────────┐             │
 *   │            │ [logo]   │             │   <- widget's own header (default)
 *   │            │  widget  │             │
 *   │            └──────────┘             │
 *   │                                     │
 *   │ [trust]                    [legal]  │
 *   └─────────────────────────────────────┘
 *
 * Slot story (forward-looking): the chips carry `data-ah-slot` attrs so a
 * future Liquid template can reposition any element via `{% slot %}` tags.
 * `logoPosition` is the prop-level shortcut for the most common override.
 */

import {
  sanitizeUrl,
  sanitizeCssColor,
  buildThemePageBackground,
  escapeHtml,
} from "./sanitization-utils";
import type { Branding, Theme } from "@authhero/adapter-interfaces";
import { getCookie } from "hono/cookie";
import { buildHash } from "../../build-hash";
import { createTranslation, getLocaleDisplayName } from "../../i18n";
import {
  applyUniversalLoginTemplate,
  templateIsFullDocument,
} from "./universal-login-template";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DarkModePreference = "auto" | "light" | "dark";
export type LogoPosition = "widget" | "chip" | "none";

/**
 * Resolve the dark-mode preference for the current request.
 *
 * Priority: per-user `ah-dark-mode` cookie > tenant `branding.dark_mode` > "auto".
 * The cookie lets a user override the tenant default for the rest of their session.
 */
export function resolveDarkMode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  branding: Branding | null | undefined,
): DarkModePreference {
  const cookie = getCookie(ctx, "ah-dark-mode");
  if (cookie === "dark" || cookie === "light" || cookie === "auto") {
    return cookie;
  }
  const fromBranding = branding?.dark_mode;
  if (
    fromBranding === "dark" ||
    fromBranding === "light" ||
    fromBranding === "auto"
  ) {
    return fromBranding;
  }
  return "auto";
}

export type WidgetPageProps = {
  widgetHtml: string;
  screenId: string;
  branding?: {
    colors?: {
      primary?: string;
      page_background?:
        | string
        | { type?: string; start?: string; end?: string; angle_deg?: number };
    };
    logo_url?: string;
    favicon_url?: string;
    font?: { url?: string };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme?: any;
  themePageBackground?: {
    background_color?: string;
    background_image_url?: string;
    page_layout?: string;
  };
  clientName: string;
  poweredByLogo?: {
    url: string;
    darkUrl?: string;
    alt: string;
    href?: string;
    height?: number;
  };
  language?: string;
  availableLanguages?: string[];
  termsAndConditionsUrl?: string;
  darkMode?: DarkModePreference;
  /**
   * Where to render the tenant logo on the page.
   * - "widget" (default): inside the widget card, via the widget's own header.
   * - "chip": floating pill in the top-left page corner. The widget's
   *   internal logo should also be suppressed in this mode (callers use
   *   `derivePageLogoPlacement` to clone the theme accordingly before SSR).
   * - "none": no logo on the page or in the widget.
   *
   * If not provided, defaults to `theme.page_background.logo_placement`,
   * falling back to "widget".
   */
  logoPosition?: LogoPosition;
  /** Optional inline script injected at page level (e.g. WebAuthn ceremony) */
  extraScript?: string;
  /**
   * When set, replaces the default body content (widget + chips) with a
   * pre-expanded HTML fragment. Used by the universal-login custom-template
   * path: the tenant's template is run through `applyUniversalLoginTemplate`
   * and the resulting body markup is injected here, while the page shell
   * (html/head, dark-mode runtime, background tint, body styling) is still
   * managed by this component.
   */
  customBodyHtml?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DARK_MODE_CSS_VARS: Record<string, string> = {
  "--ah-color-text": "#f9fafb",
  "--ah-color-text-muted": "#9ca3af",
  "--ah-color-text-label": "#d1d5db",
  "--ah-color-header": "#f9fafb",
  "--ah-color-bg": "#1f2937",
  "--ah-color-bg-hover": "#374151",
  "--ah-color-bg-muted": "#374151",
  "--ah-color-bg-disabled": "#4b5563",
  "--ah-color-input-bg": "#374151",
  "--ah-color-border": "#4b5563",
  "--ah-color-border-hover": "#6b7280",
  "--ah-color-border-muted": "#374151",
  "--ah-color-error-bg": "rgba(220,38,38,0.2)",
  "--ah-color-success-bg": "rgba(22,163,74,0.2)",
  "--ah-color-link": "#60a5fa",
};

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function parseDarkHex(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const n = parseInt(c, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function darkLuminance(hex: string): number {
  const [r, g, b] = parseDarkHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function darkContrastRatio(h1: string, h2: string): number {
  const l1 = darkLuminance(h1);
  const l2 = darkLuminance(h2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function lightenHexDark(hex: string, pct: number): string {
  const [r, g, b] = parseDarkHex(hex);
  const f = (v: number) =>
    Math.min(255, Math.round(v + (255 - v) * pct))
      .toString(16)
      .padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}
function darkModeCssVarRules(selector: string, primaryColor?: string): string {
  const vars: Record<string, string> = { ...DARK_MODE_CSS_VARS };
  if (primaryColor) {
    const darkBg = DARK_MODE_CSS_VARS["--ah-color-bg"] || "#1f2937";
    if (darkContrastRatio(primaryColor, darkBg) < 3) {
      let adjusted = primaryColor;
      for (let i = 1; i <= 10; i++) {
        adjusted = lightenHexDark(primaryColor, i * 0.1);
        if (darkContrastRatio(adjusted, darkBg) >= 3) break;
      }
      vars["--ah-color-primary"] = adjusted;
      vars["--ah-color-primary-hover"] = adjusted;
    }
    const BIAS = 1.35;
    const btnBg = vars["--ah-color-primary"] || primaryColor;
    const whiteContrast = darkContrastRatio(btnBg, "#ffffff");
    const blackContrast = darkContrastRatio(btnBg, "#000000");
    vars["--ah-color-text-on-primary"] =
      blackContrast > whiteContrast * BIAS ? "#000000" : "#ffffff";
  }
  const props = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v} !important`)
    .join("; ");
  return `${selector} { ${props}; }`;
}

// ---------------------------------------------------------------------------
// Chip fragments — exported so the Liquid custom-template pipeline can emit
// the same modern chrome the default JSX path renders. Each function returns
// a Hono JSX element that callers can either embed inline or `.toString()` to
// substitute into a template slot.
// ---------------------------------------------------------------------------

const DARK_MODE_TOGGLE_ONCLICK = `(function(btn){var h=document.documentElement;var cur=h.classList.contains('ah-dark-mode')?'dark':h.classList.contains('ah-light-mode')?'light':'auto';var next=cur==='auto'?'dark':cur==='dark'?'light':'auto';h.classList.remove('ah-dark-mode','ah-light-mode');if(next==='dark'){h.classList.add('ah-dark-mode');h.setAttribute('data-mode','dark')}else if(next==='light'){h.classList.add('ah-light-mode');h.setAttribute('data-mode','light')}else{h.removeAttribute('data-mode')}btn.querySelector('.icon-sun').style.display=next==='light'?'block':'none';btn.querySelector('.icon-moon').style.display=next==='dark'?'block':'none';btn.querySelector('.icon-auto').style.display=next==='auto'?'block':'none';document.cookie='ah-dark-mode='+next+';path=/;max-age=31536000;SameSite=Lax';if(window.__ahDarkMode){window.__ahDarkMode(next)}})(this)`;

const LANGUAGE_PICKER_ONCHANGE = `var p=new URLSearchParams(window.location.search);p.set('ui_locales',this.value);window.location.search=p.toString()`;

/**
 * How a corner chip renders its surface.
 * - "auto" (default): pill when there's a background image, plain text on a
 *   solid background — driven by the page-level `data-bg` attribute.
 * - "plain": always text-only, regardless of background.
 * - "pill": always a translucent pill, regardless of background.
 *
 * Templates choose this per slot via `{%- authhero:legal style="plain" -%}`.
 */
export type ChipStyle = "auto" | "plain" | "pill";

/** Modifier class that forces a chip's surface on/off (empty for "auto"). */
function chipVariantClass(variant?: ChipStyle): string {
  if (variant === "plain") return " ah-chip--plain";
  if (variant === "pill") return " ah-chip--pill";
  return "";
}

export function LogoChip({
  logoUrl,
  clientName,
  variant,
}: {
  logoUrl?: string | null;
  clientName: string;
  variant?: ChipStyle;
}) {
  const safe = logoUrl ? sanitizeUrl(logoUrl) : null;
  return (
    <div
      class={`ah-chip ah-chip-logo${chipVariantClass(variant)}`}
      data-ah-slot="top-left"
    >
      {safe ? (
        <img src={safe} alt={clientName} />
      ) : (
        <span class="ah-logo-text">{clientName}</span>
      )}
    </div>
  );
}

export function DarkModeToggle({ darkMode }: { darkMode: DarkModePreference }) {
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onclick={DARK_MODE_TOGGLE_ONCLICK}
    >
      <svg
        class="icon-auto"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style={darkMode === "auto" ? undefined : "display:none"}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" />
      </svg>
      <svg
        class="icon-sun"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style={darkMode === "light" ? undefined : "display:none"}
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
      </svg>
      <svg
        class="icon-moon"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style={darkMode === "dark" ? undefined : "display:none"}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}

export function LanguagePicker({
  language,
  availableLanguages,
}: {
  language?: string;
  availableLanguages: string[];
}) {
  if (!availableLanguages || availableLanguages.length < 2) return null;
  return (
    <div class="ah-lang">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <select aria-label="Language" onchange={LANGUAGE_PICKER_ONCHANGE}>
        {availableLanguages.map((lang) => (
          <option value={lang} selected={lang === language}>
            {getLocaleDisplayName(lang)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SettingsChip({
  darkMode,
  language,
  availableLanguages,
  variant,
}: {
  darkMode: DarkModePreference;
  language?: string;
  availableLanguages?: string[];
  variant?: ChipStyle;
}) {
  return (
    <div
      class={`ah-chip ah-chip-settings${chipVariantClass(variant)}`}
      data-ah-slot="top-right"
    >
      <DarkModeToggle darkMode={darkMode} />
      {availableLanguages && (
        <LanguagePicker
          language={language}
          availableLanguages={availableLanguages}
        />
      )}
    </div>
  );
}

export function PoweredByChip({
  url,
  href,
  alt,
  height,
  variant,
}: {
  url: string;
  href?: string;
  alt?: string;
  height?: number;
  variant?: ChipStyle;
}) {
  const safeUrl = sanitizeUrl(url);
  const safeHref = href ? sanitizeUrl(href) : null;
  if (!safeUrl) return null;
  const img = <img src={safeUrl} alt={alt || ""} height={height || 18} />;
  return (
    <div
      class={`ah-chip ah-chip-trust${chipVariantClass(variant)}`}
      data-ah-slot="bottom-left"
    >
      {safeHref ? (
        <a href={safeHref} target="_blank" rel="noopener noreferrer">
          {img}
        </a>
      ) : (
        img
      )}
    </div>
  );
}

export function LegalChip({
  termsAndConditionsUrl,
  language,
  variant,
}: {
  termsAndConditionsUrl?: string;
  language?: string;
  variant?: ChipStyle;
}) {
  if (!termsAndConditionsUrl) return null;
  const { m: commonT } = createTranslation(
    "common",
    "common",
    language || "en",
  );
  return (
    <div
      class={`ah-chip-legal${chipVariantClass(variant)}`}
      data-ah-slot="bottom-right"
    >
      <a href={termsAndConditionsUrl} target="_blank" rel="noopener noreferrer">
        {commonT.termsShortText()}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget container style
// ---------------------------------------------------------------------------

/**
 * Build the inline `style` value for the widget container. Custom templates
 * inject the widget into a tenant-controlled body fragment, so the same CSS
 * variables (and responsive width clamp) the default layout uses must be
 * forwarded — otherwise primary-color theming and the responsive width are
 * lost on the custom-template path.
 */
function buildWidgetContainerStyle(
  branding: WidgetPageProps["branding"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme: any,
): string {
  const cssVariables: string[] = [];
  const primaryColor = sanitizeCssColor(branding?.colors?.primary);
  if (primaryColor) {
    cssVariables.push(`--ah-color-primary: ${primaryColor}`);
  }
  const effectivePrimaryBtn =
    sanitizeCssColor(theme?.colors?.primary_button) || primaryColor;
  if (effectivePrimaryBtn) {
    const BIAS = 1.35;
    const whiteContrast = darkContrastRatio(effectivePrimaryBtn, "#ffffff");
    const blackContrast = darkContrastRatio(effectivePrimaryBtn, "#000000");
    const textOnPrimary =
      blackContrast > whiteContrast * BIAS ? "#000000" : "#ffffff";
    cssVariables.push(`--ah-color-text-on-primary: ${textOnPrimary}`);
  }
  return cssVariables.length > 0
    ? cssVariables.join("; ") + "; width: clamp(320px, 100%, 400px);"
    : "width: clamp(320px, 100%, 400px);";
}

// ---------------------------------------------------------------------------
// Page body layout
// ---------------------------------------------------------------------------

/** Layout values for the page `<body>` — shared by the body-fragment path
 *  (applied inline) and the full-document path (emitted into the stylesheet). */
type BodyLayout = {
  background: string;
  fontFamily: string;
  justifyContent: string;
  padding: string;
};

/**
 * Resolve the page-body layout (centering, background, font) from the theme
 * and branding. Keeps the inline `<body>` style (fragment path) and the
 * `auth0:head` stylesheet rule (full-document path) in sync so an Auth0-style
 * template centers on the page background just like the default chrome does.
 */
function buildBodyLayout(opts: {
  themePageBackground?: {
    background_color?: string;
    background_image_url?: string;
    page_layout?: string;
  };
  brandingPageBackground?:
    | string
    | { type?: string; start?: string; end?: string; angle_deg?: number };
  fontUrl?: string | null;
}): BodyLayout {
  const pageLayout = opts.themePageBackground?.page_layout || "center";
  const justifyContent =
    pageLayout === "left"
      ? "flex-start"
      : pageLayout === "right"
        ? "flex-end"
        : "center";
  const padding =
    pageLayout === "left"
      ? "20px 20px 20px 80px"
      : pageLayout === "right"
        ? "20px 80px 20px 20px"
        : "20px";
  return {
    background: buildThemePageBackground(
      opts.themePageBackground,
      opts.brandingPageBackground,
    ),
    fontFamily: opts.fontUrl
      ? "'Inter', system-ui, sans-serif"
      : "system-ui, -apple-system, sans-serif",
    justifyContent,
    padding,
  };
}

// ---------------------------------------------------------------------------
// Page CSS
// ---------------------------------------------------------------------------

function buildPageCss(opts: {
  primaryColor?: string;
  themePrimary?: string;
  widgetBackground: string;
  /**
   * Page-body layout (centering, background, font). Only the full-document
   * (Auth0-style) path passes this — there the tenant owns `<body>`, so the
   * centering/background that the body-fragment path applies inline must come
   * from the stylesheet instead. The fragment path omits it: its inline
   * `<body>` style already covers layout and wins over a stylesheet rule.
   */
  bodyLayout?: BodyLayout;
}): string {
  const { primaryColor, themePrimary, widgetBackground, bodyLayout } = opts;
  const bodyRule = bodyLayout
    ? `
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: ${bodyLayout.justifyContent};
      background: ${bodyLayout.background};
      font-family: ${bodyLayout.fontFamily};
      padding: ${bodyLayout.padding};
    }`
    : "";
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ${bodyRule}

    /* ============= STEP TRANSITIONS =============
       Cross-document view transitions morph the widget's box between
       login steps (e.g. when the next step is taller) and cross-fade the
       form content, à la Stripe's dashboard login. This is opt-in per
       same-origin navigation and a no-op (instant nav) on browsers that
       don't support it yet. The widget is lifted into its own named group
       so only it animates its size; the rest of the page (background +
       chips) cross-fades via the default \`root\` group, which is invisible
       since those are unchanged between steps. */
    @view-transition { navigation: auto; }

    /* Resize-forward (Stripe-style): the widget box morphs its height from
       the old step to the new one — that resize is the main motion. Content
       keeps its natural height (height: auto) so the snapshot isn't stretched
       to the morphing box, and does a quick, clean cross-fade underneath. */
    ::view-transition-group(ah-widget) {
      animation-duration: 420ms;
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    ::view-transition-old(ah-widget),
    ::view-transition-new(ah-widget) {
      height: auto;
    }
    ::view-transition-old(ah-widget) {
      animation: 140ms ease both ah-widget-out;
    }
    ::view-transition-new(ah-widget) {
      animation: 240ms ease 110ms both ah-widget-in;
    }
    @keyframes ah-widget-out { to { opacity: 0; } }
    @keyframes ah-widget-in { from { opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      ::view-transition-group(*),
      ::view-transition-old(*),
      ::view-transition-new(*) { animation: none !important; }
    }

    /* ============= CHROME TOKENS =============
       The chip surface tokens flip based on:
         - data-mode (light/dark) — controls fg/bg pair
         - data-bg (image/none)   — toggles whether chips have a surface
       This keeps a single chip ruleset for all four combinations. */
    :root {
      /* Pill surface values live in their own *-pill vars so they survive the
         data-bg="none" reset below; the base tokens reference them, and the
         .ah-chip--pill modifier re-points the base tokens back at them to
         force a pill even on a solid background. */
      --ah-chip-bg-pill:       rgba(15,17,21,0.55);
      --ah-chip-bg-hover-pill: rgba(15,17,21,0.75);
      --ah-chip-border-pill:   rgba(255,255,255,0.12);
      --ah-chip-logo-bg-pill:  rgba(15,17,21,0.4);
      --ah-chip-bg:        var(--ah-chip-bg-pill);
      --ah-chip-bg-hover:  var(--ah-chip-bg-hover-pill);
      --ah-chip-border:    var(--ah-chip-border-pill);
      --ah-chip-fg:        rgba(255,255,255,0.85);
      --ah-chip-fg-dim:    rgba(255,255,255,0.6);
      --ah-chip-fg-mid:    rgba(255,255,255,0.7);
      --ah-chip-fg-strong: rgba(255,255,255,0.95);
      --ah-chip-active-bg: rgba(255,255,255,0.14);
      --ah-chip-logo-bg:   var(--ah-chip-logo-bg-pill);
      --ah-legal-fg:       rgba(255,255,255,0.55);
      --ah-legal-fg-hover: rgba(255,255,255,0.95);
      --ah-legal-sep:      rgba(255,255,255,0.25);
      --ah-bg-tint: radial-gradient(
        ellipse at center,
        rgba(15,23,48,0.30) 0%,
        rgba(15,23,48,0.55) 70%,
        rgba(10,15,30,0.78) 100%);
    }

    /* Light page mode — flip to dark text on translucent white chips.
       The :root block above seeds dark tokens; data-mode="light" overrides
       them when the toggle is explicit, and the prefers-color-scheme block
       below mirrors them when the user is in auto mode (no data-mode set). */
    html[data-mode="light"] {
      --ah-chip-bg-pill:       rgba(255,255,255,0.7);
      --ah-chip-bg-hover-pill: rgba(255,255,255,0.92);
      --ah-chip-border-pill:   rgba(15,17,21,0.08);
      --ah-chip-logo-bg-pill:  rgba(255,255,255,0.75);
      --ah-chip-fg:        #0f1115;
      --ah-chip-fg-dim:    rgba(15,17,21,0.55);
      --ah-chip-fg-mid:    rgba(15,17,21,0.65);
      --ah-chip-fg-strong: rgba(15,17,21,0.95);
      --ah-chip-active-bg: rgba(15,17,21,0.08);
      --ah-legal-fg:       rgba(15,17,21,0.5);
      --ah-legal-fg-hover: rgba(15,17,21,0.9);
      --ah-legal-sep:      rgba(15,17,21,0.2);
      --ah-bg-tint: transparent;
    }

    @media (prefers-color-scheme: light) {
      html:not([data-mode]) {
        --ah-chip-bg-pill:       rgba(255,255,255,0.7);
        --ah-chip-bg-hover-pill: rgba(255,255,255,0.92);
        --ah-chip-border-pill:   rgba(15,17,21,0.08);
        --ah-chip-logo-bg-pill:  rgba(255,255,255,0.75);
        --ah-chip-fg:        #0f1115;
        --ah-chip-fg-dim:    rgba(15,17,21,0.55);
        --ah-chip-fg-mid:    rgba(15,17,21,0.65);
        --ah-chip-fg-strong: rgba(15,17,21,0.95);
        --ah-chip-active-bg: rgba(15,17,21,0.08);
        --ah-legal-fg:       rgba(15,17,21,0.5);
        --ah-legal-fg-hover: rgba(15,17,21,0.9);
        --ah-legal-sep:      rgba(15,17,21,0.2);
        --ah-bg-tint: transparent;
      }
    }

    /* No background image — chips become text-only on a solid page color */
    html[data-bg="none"] {
      --ah-chip-bg:        transparent;
      --ah-chip-bg-hover:  transparent;
      --ah-chip-border:    transparent;
      --ah-chip-logo-bg:   transparent;
      --ah-bg-tint:        transparent;
    }

    /* ============= BACKGROUND TINT =============
       Only renders when bg image is present. The token is transparent
       in data-bg=none mode so the element stays in the DOM but invisible. */
    .ah-bg-tint {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background: var(--ah-bg-tint);
      transition: background 300ms ease;
    }
    .widget-container {
      position: relative;
      z-index: 1;
      /* Names this box as its own view-transition group so its size morphs
         smoothly across step navigations (see STEP TRANSITIONS above). */
      view-transition-name: ah-widget;
    }

    /* ============= IN-FLOW WIDGET STACK =============
       Optional wrapper (used by the default custom template) that places
       in-flow content directly above/below the widget card, sharing its
       width and centering. Unlike the fixed-position corner chips, these
       regions are normal document flow — tenants author content into them
       in their template. Empty regions collapse so they add no spacing. */
    .ah-widget-stack {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      width: clamp(320px, 100%, 400px);
    }
    .ah-widget-stack .widget-container { width: 100%; }
    .ah-above-widget, .ah-below-widget {
      width: 100%;
      text-align: center;
      color: var(--ah-chip-fg);
      font-size: 13px;
      line-height: 1.5;
    }
    .ah-above-widget:empty, .ah-below-widget:empty { display: none; }
    .ah-above-widget a, .ah-below-widget a { color: var(--ah-color-link, #2563eb); }

    /* The "widget" logo position is rendered by the widget's own shadow DOM
       (see authhero-widget.tsx). The page only renders a logo when the
       caller opts into the chip variant. */
    html[data-logo-position="widget"] .ah-chip-logo,
    html[data-logo-position="none"] .ah-chip-logo { display: none; }

    /* ============= FLOATING CHIPS =============
       Self-contained pills positioned at page corners. Surface comes from
       the chrome tokens above, so they adapt to mode + bg automatically. */
    .ah-chip {
      position: fixed;
      z-index: 10;
      background: var(--ah-chip-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--ah-chip-border);
      color: var(--ah-chip-fg);
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
    }

    .ah-chip-logo {
      top: 24px; left: 24px;
      padding: 6px 14px 6px 8px;
      background: var(--ah-chip-logo-bg);
    }
    .ah-chip-logo img { display: block; max-height: 20px; width: auto; }
    .ah-chip-logo .ah-logo-text {
      font-family: 'Inter Tight', 'Inter', system-ui, sans-serif;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 12px;
    }

    .ah-chip-settings {
      top: 24px; right: 24px;
      padding: 4px;
      gap: 0;
    }
    .ah-chip-settings button,
    .ah-chip-settings .ah-lang {
      background: 0; border: 0; padding: 6px 10px; cursor: pointer;
      color: var(--ah-chip-fg-dim);
      font-size: 12px; font-weight: 500;
      border-radius: 9999px;
      display: inline-flex; align-items: center; gap: 5px;
      transition: 140ms;
    }
    .ah-chip-settings button:hover,
    .ah-chip-settings .ah-lang:hover { color: var(--ah-chip-fg-strong); }
    .ah-chip-settings .ah-lang select {
      appearance: none; -webkit-appearance: none;
      background: transparent; color: inherit; border: 0;
      font: inherit; cursor: pointer; padding: 0;
      outline: 0;
    }

    .ah-chip-trust {
      bottom: 24px; left: 24px;
      padding: 7px 14px 7px 10px;
      color: var(--ah-chip-fg-mid);
    }
    .ah-chip-trust img { display: block; max-height: 18px; width: auto; opacity: 0.85; }
    .ah-chip-trust:hover { color: var(--ah-chip-fg-strong); }
    .ah-chip-trust a { color: inherit; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }

    /* Legal — chip when there's a bg image, plain text on solid bg */
    .ah-chip-legal {
      position: fixed;
      bottom: 24px; right: 24px;
      z-index: 10;
      background: var(--ah-chip-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--ah-chip-border);
      border-radius: 9999px;
      padding: 7px 14px;
      color: var(--ah-legal-fg);
      font-size: 11px;
      letter-spacing: 0.04em;
      display: inline-flex; align-items: center; gap: 10px;
      transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
    }
    html[data-bg="none"] .ah-chip-legal { padding: 4px 0; bottom: 28px; right: 28px; }
    .ah-chip-legal a {
      color: inherit; text-decoration: none;
      transition: color 140ms;
    }
    .ah-chip-legal a:hover { color: var(--ah-legal-fg-hover); }
    .ah-chip-legal .ah-sep { color: var(--ah-legal-sep); }

    /* ============= PER-SLOT CHIP STYLE OVERRIDES =============
       Templates can force a chip's surface via the slot tag's style arg
       (e.g. {%- authhero:legal style="plain" -%}). Without it chips follow
       the data-bg default (pill with a background image, plain on a solid
       background). These modifiers re-point the surface tokens directly on
       the element, so they win over the inherited data-bg values. */
    .ah-chip--pill {
      --ah-chip-bg:        var(--ah-chip-bg-pill);
      --ah-chip-bg-hover:  var(--ah-chip-bg-hover-pill);
      --ah-chip-border:    var(--ah-chip-border-pill);
      --ah-chip-logo-bg:   var(--ah-chip-logo-bg-pill);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    .ah-chip-legal.ah-chip--pill { padding: 7px 14px; bottom: 24px; right: 24px; }

    .ah-chip--plain {
      --ah-chip-bg:        transparent;
      --ah-chip-bg-hover:  transparent;
      --ah-chip-border:    transparent;
      --ah-chip-logo-bg:   transparent;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .ah-chip-legal.ah-chip--plain { padding: 4px 0; bottom: 28px; right: 28px; }

    /* ============= EXPLICIT DARK MODE FOR WIDGET =============
       The page-level dark/light is controlled by data-mode (above).
       The widget itself has its own --ah-color-* vars set via JS.
       html.ah-dark-mode is the legacy class kept for the widget toggle. */
    ${darkModeCssVarRules("html.ah-dark-mode authhero-widget", primaryColor || themePrimary)}
    @media (prefers-color-scheme: dark) {
      ${darkModeCssVarRules("html:not(.ah-light-mode) authhero-widget", primaryColor || themePrimary)}
    }

    /* ============= MOBILE =============
       Widget fills the viewport, chrome chips minimize. */
    @media (max-width: 560px) {
      body { justify-content: center !important; padding: 20px !important; }
    }
    @media (max-width: 480px) {
      body { background: ${widgetBackground} !important; padding: 0 !important; }
      html.ah-dark-mode body { background: #111827 !important; }
      .widget-container { width: 100%; }
      .ah-widget-stack { width: 100%; }
      .ah-bg-tint { display: none; }
      .ah-chip-trust, .ah-chip-legal, .ah-chip-logo { display: none; }
      .ah-chip-settings {
        top: auto; bottom: 12px; right: 12px;
      }
    }
  `;
}

// ---------------------------------------------------------------------------
// Dark-mode runtime
// ---------------------------------------------------------------------------

/**
 * Build the dark-mode CSS-variable set serialized for the client runtime.
 * Mirrors the contrast adjustments `darkModeCssVarRules` applies so the
 * toggled dark theme matches the prefers-dark CSS.
 */
function buildDarkVarsJson(effectivePrimary?: string): string {
  const darkVars: Record<string, string> = { ...DARK_MODE_CSS_VARS };
  if (effectivePrimary) {
    const darkBg = DARK_MODE_CSS_VARS["--ah-color-bg"] || "#1f2937";
    if (darkContrastRatio(effectivePrimary, darkBg) < 3) {
      let adjusted = effectivePrimary;
      for (let i = 1; i <= 10; i++) {
        adjusted = lightenHexDark(effectivePrimary, i * 0.1);
        if (darkContrastRatio(adjusted, darkBg) >= 3) break;
      }
      darkVars["--ah-color-primary"] = adjusted;
      darkVars["--ah-color-primary-hover"] = adjusted;
    }
    const BIAS = 1.35;
    const btnBg = darkVars["--ah-color-primary"] || effectivePrimary;
    const wc = darkContrastRatio(btnBg, "#ffffff");
    const bc = darkContrastRatio(btnBg, "#000000");
    darkVars["--ah-color-text-on-primary"] =
      bc > wc * BIAS ? "#000000" : "#ffffff";
  }
  return JSON.stringify(darkVars);
}

/** Inline JS that applies dark-mode CSS vars to the widget's shadow DOM. */
function buildDarkModeRuntimeScript(darkVarsJson: string): string {
  return `(function(){
try{var p=localStorage.getItem('ah-dark-mode');if(p!==null&&!document.cookie.match(/ah-dark-mode=/)){var v=p==='1'?'dark':'light';document.cookie='ah-dark-mode='+v+';path=/;max-age=31536000;SameSite=Lax';localStorage.removeItem('ah-dark-mode')}}catch(e){}
var dv=${darkVarsJson};
function apply(w){for(var k in dv)w.style.setProperty(k,dv[k])}
function remove(w){for(var k in dv)w.style.removeProperty(k)}
window.__ahDarkMode=function(mode){
var w=document.querySelector('authhero-widget');if(!w)return;
if(mode==='dark'){apply(w)}
else if(mode==='light'){remove(w)}
else{if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches){apply(w)}else{remove(w)}}
};
var h=document.documentElement;
var cur=h.classList.contains('ah-dark-mode')?'dark':h.classList.contains('ah-light-mode')?'light':'auto';
window.__ahDarkMode(cur);
if(window.matchMedia){window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){
var h2=document.documentElement;if(!h2.classList.contains('ah-dark-mode')&&!h2.classList.contains('ah-light-mode')){window.__ahDarkMode('auto')}
})}
})()`;
}

// ---------------------------------------------------------------------------
// Head essentials (Auth0 `{%- auth0:head -%}` compatibility)
// ---------------------------------------------------------------------------

/**
 * The functional `<head>` contents the page shell injects, as an HTML string.
 *
 * This is what the `{%- auth0:head -%}` slot emits when a tenant uploads a
 * full-document (Auth0-style) template. It carries only the essentials the
 * widget needs to render and theme — the page CSS, fonts, favicon, the widget
 * script, and the dark-mode runtime. Unlike the default body-fragment path,
 * a full-document template owns its own layout/CSS, so the curated chip chrome
 * is not forced on it (the `authhero:*` chip slots remain available if wanted).
 */
export function buildHeadEssentials(opts: {
  clientName: string;
  branding?: WidgetPageProps["branding"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme?: any;
}): string {
  const faviconUrl = sanitizeUrl(opts.branding?.favicon_url);
  const fontUrl = sanitizeUrl(opts.branding?.font?.url);
  const primaryColor = sanitizeCssColor(opts.branding?.colors?.primary);
  const themePrimary = sanitizeCssColor(opts.theme?.colors?.primary_button);
  const widgetBackground =
    sanitizeCssColor(opts.theme?.colors?.widget_background) || "#ffffff";
  // Full-document templates own `<body>` (no inline body style), so the page
  // layout must come from the stylesheet — otherwise the widget renders
  // top-left on a bare white page ("no styles"). This centers it on the page
  // background, matching what Auth0's own `auth0:head` ships.
  const bodyLayout = buildBodyLayout({
    themePageBackground: opts.theme?.page_background,
    brandingPageBackground: opts.branding?.colors?.page_background,
    fontUrl,
  });
  const pageCss = buildPageCss({
    primaryColor,
    themePrimary,
    widgetBackground,
    bodyLayout,
  });
  const darkVarsJson = buildDarkVarsJson(themePrimary || primaryColor);

  return [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `<title>Sign in - ${escapeHtml(opts.clientName)}</title>`,
    faviconUrl ? `<link rel="icon" href="${faviconUrl}">` : "",
    fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : "",
    `<style>${pageCss}</style>`,
    `<script type="module" src="/u/widget/authhero-widget.esm.js?v=${buildHash}"></script>`,
    `<script>${buildDarkModeRuntimeScript(darkVarsJson)}</script>`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// WidgetPage component
// ---------------------------------------------------------------------------

export function WidgetPage({
  widgetHtml,
  screenId,
  branding,
  theme,
  themePageBackground,
  clientName,
  poweredByLogo,
  language,
  availableLanguages,
  termsAndConditionsUrl,
  darkMode = "auto",
  logoPosition,
  extraScript,
  customBodyHtml,
}: WidgetPageProps) {
  const resolvedLogoPosition: LogoPosition =
    logoPosition ?? theme?.page_background?.logo_placement ?? "widget";
  // Primary color is consumed below by the dark-mode runtime as a fallback
  // for `theme.colors.primary_button` and by `buildPageCss`. The widget
  // container's CSS variables are computed by `buildWidgetContainerStyle`.
  const primaryColor = sanitizeCssColor(branding?.colors?.primary);

  const hasBgImage = !!themePageBackground?.background_image_url;
  const faviconUrl = sanitizeUrl(branding?.favicon_url);
  const fontUrl = sanitizeUrl(branding?.font?.url);
  const widgetBackground =
    sanitizeCssColor(theme?.colors?.widget_background) || "#ffffff";
  // Same layout resolution the full-document path emits into the stylesheet;
  // here it's applied inline on `<body>` (and wins over any stylesheet rule).
  const bodyLayout = buildBodyLayout({
    themePageBackground,
    brandingPageBackground: branding?.colors?.page_background,
    fontUrl,
  });

  // ---- Sanitize logo URL ----
  const safeLogoUrl = branding?.logo_url
    ? sanitizeUrl(branding.logo_url)
    : null;

  const bodyStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: bodyLayout.justifyContent,
    background: bodyLayout.background,
    fontFamily: bodyLayout.fontFamily,
    padding: bodyLayout.padding,
  };

  const widgetContainerStyle = buildWidgetContainerStyle(branding, theme);

  // ---- HTML element data attrs ----
  // data-mode drives chip light/dark; data-bg drives chip surface on/off;
  // data-logo-position drives which logo renders.
  const htmlClass =
    darkMode === "dark"
      ? "ah-dark-mode"
      : darkMode === "light"
        ? "ah-light-mode"
        : undefined;
  const htmlDataMode =
    darkMode === "dark" ? "dark" : darkMode === "light" ? "light" : undefined;

  // ---- Dark-mode runtime vars (for client-side toggle) ----
  const darkVarsJson = buildDarkVarsJson(
    sanitizeCssColor(theme?.colors?.primary_button) || primaryColor,
  );

  const pageCss = buildPageCss({
    primaryColor,
    themePrimary: sanitizeCssColor(theme?.colors?.primary_button),
    widgetBackground,
  });

  // -------------------------------------------------------------------------
  // Logo render helper — page-level chip variant only. The "widget" position
  // is rendered by the widget's own shadow DOM from `branding.logo_url`, so
  // the page doesn't emit a duplicate. The chip is hidden by CSS when
  // logoPosition === "widget".
  // -------------------------------------------------------------------------

  const logoChip = <LogoChip logoUrl={safeLogoUrl} clientName={clientName} />;

  const settingsChip = (
    <SettingsChip
      darkMode={darkMode}
      language={language}
      availableLanguages={availableLanguages}
    />
  );

  const trustChip = poweredByLogo ? (
    <PoweredByChip
      url={poweredByLogo.url}
      href={poweredByLogo.href}
      alt={poweredByLogo.alt}
      height={poweredByLogo.height}
    />
  ) : null;

  const legalChip = (
    <LegalChip
      termsAndConditionsUrl={termsAndConditionsUrl}
      language={language}
    />
  );

  return (
    <html
      lang={language || "en"}
      class={htmlClass}
      data-mode={htmlDataMode}
      data-bg={hasBgImage ? "image" : "none"}
      data-logo-position={resolvedLogoPosition}
    >
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sign in - {clientName}</title>
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
        {fontUrl && <link rel="stylesheet" href={fontUrl} />}
        <style dangerouslySetInnerHTML={{ __html: pageCss }} />
        <script
          type="module"
          src={`/u/widget/authhero-widget.esm.js?v=${buildHash}`}
        />
      </head>
      <body style={bodyStyle}>
        {hasBgImage && <div class="ah-bg-tint" aria-hidden="true" />}

        {customBodyHtml ? (
          /* Custom-template path: tenant-controlled body markup. The
             expanded fragment already contains the widget mount + selected
             chips. The shell still wraps it for the page CSS, runtime, and
             bg tint.

             `display: contents` keeps this wrapper out of the layout: its
             children participate directly in the body's flex layout, exactly
             as on the default path. Without it the wrapper is a shrink-to-fit
             flex item, which collapses the widget container's
             `width: clamp(320px, 100%, 400px)` to its 320px floor and pins it
             off-centre on narrow (mobile) viewports. */
          <div
            style={{ display: "contents" }}
            dangerouslySetInnerHTML={{ __html: customBodyHtml }}
          />
        ) : (
          <>
            {/* Widget container — the widget's own shadow DOM renders the
                logo in its header for the default "widget" position. */}
            <div
              class="widget-container"
              data-authhero-widget-container
              data-screen={screenId}
              style={widgetContainerStyle}
              dangerouslySetInnerHTML={{ __html: widgetHtml }}
            />

            {/* Floating chips. logoChip is hidden by CSS when
                data-logo-position="widget" (the default). */}
            {logoChip}
            {settingsChip}
            {trustChip}
            {legalChip}
          </>
        )}

        {extraScript && (
          <script dangerouslySetInnerHTML={{ __html: extraScript }} />
        )}

        {/* Dark-mode runtime — applies dark CSS vars to the widget's
            shadow DOM since CSS variables don't pierce shadow boundaries
            via inheritance for dynamically-created custom properties. */}
        <script
          dangerouslySetInnerHTML={{
            __html: buildDarkModeRuntimeScript(darkVarsJson),
          }}
        />
      </body>
    </html>
  );
}

// ---------------------------------------------------------------------------
// Page-logo placement helper
// ---------------------------------------------------------------------------

/**
 * Reads `theme.page_background.logo_placement` and returns the resolved
 * page-level `logoPosition` plus a theme variant suitable for passing to
 * the widget SSR. When placement is "chip" or "none" we override
 * `theme.widget.logo_position = "none"` so the widget's internal header
 * logo is suppressed — otherwise we'd render a duplicate (chip + widget
 * header) or a logo when the caller asked for none.
 *
 * Callers should pass the returned `theme` to `JSON.stringify` for the
 * widget's `theme` attribute, and forward `logoPosition` to `WidgetPage`.
 */
export function derivePageLogoPlacement<
  T extends
    | {
        page_background?: { logo_placement?: LogoPosition };
        widget?: { logo_position?: string };
      }
    | null
    | undefined,
>(theme: T): { logoPosition: LogoPosition; theme: T } {
  const placement = theme?.page_background?.logo_placement ?? "widget";
  if (placement === "widget" || !theme) {
    return { logoPosition: placement, theme };
  }
  const adjusted = {
    ...theme,
    widget: { ...(theme.widget ?? {}), logo_position: "none" },
  } as T;
  return { logoPosition: placement, theme: adjusted };
}

// ---------------------------------------------------------------------------
// SSR rendering helper (unchanged)
// ---------------------------------------------------------------------------

export async function renderWidgetSSR(params: {
  screenId: string;
  screenJson: string;
  brandingJson?: string;
  themeJson?: string;
  state: string;
  authParamsJson: string;
}): Promise<string> {
  const {
    screenId,
    screenJson,
    brandingJson,
    themeJson,
    state,
    authParamsJson,
  } = params;

  try {
    if (typeof (globalThis as any).window === "undefined") {
      (globalThis as any).window = globalThis;
    }
    const { renderToString } = await import("@authhero/widget/hydrate");
    // JSON is delivered as <script type="application/json"> children rather
    // than as HTML attributes. The HTML parser does NOT decode character
    // references inside <script> content, so the JSON round-trips verbatim
    // — including any HTML entities embedded by inner-context escapers
    // (e.g. escapeHtml on the userinfo dump in the try-connection-result
    // screen). The only sequence that could close the script early is a
    // literal "</script" — neutralize it by inserting a backslash.
    const jsonScript = (key: string, json: string): string =>
      `<script type="application/json" data-authhero="${key}">${json.replace(/<\/script/gi, "<\\/script")}</script>`;
    const result = await renderToString(
      `<authhero-widget
        id="widget"
        data-screen="${escapeHtml(screenId)}"
        state="${escapeHtml(state)}"
        auto-submit="true"
        auto-navigate="true"
      >${jsonScript("screen", screenJson)}${brandingJson ? jsonScript("branding", brandingJson) : ""}${themeJson ? jsonScript("theme", themeJson) : ""}${jsonScript("auth-params", authParamsJson)}</authhero-widget>`,
      {
        fullDocument: false,
        serializeShadowRoot: "declarative-shadow-dom",
      },
    );
    return result.html || "";
  } catch (error) {
    console.error("SSR failed:", error);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Full-page response helper
// ---------------------------------------------------------------------------

export function extractBrandingProps(
  branding: Branding | null | undefined,
): WidgetPageProps["branding"] {
  if (!branding) return undefined;
  return {
    colors: branding.colors,
    logo_url: branding.logo_url,
    favicon_url: branding.favicon_url,
    font: branding.font,
  };
}

export async function renderWidgetPageResponse(
  ctx: any,
  opts: {
    screenId: string;
    screenJson: string;
    brandingJson?: string;
    themeJson?: string;
    state: string;
    authParamsJson: string;
    branding: Branding | null | undefined;
    theme: Theme | null | undefined;
    clientName: string;
    poweredByLogo?: WidgetPageProps["poweredByLogo"];
    language?: string;
    availableLanguages?: string[];
    termsAndConditionsUrl?: string;
    darkMode?: DarkModePreference;
    logoPosition?: LogoPosition;
    extraScript?: string;
    /**
     * Optional tenant-uploaded body template. When provided, the body is
     * built via `applyUniversalLoginTemplate(customTemplateBody, ...)`
     * instead of the default chip layout. The shell (html/head, runtime,
     * bg tint) is unchanged.
     */
    customTemplateBody?: string;
  },
): Promise<Response> {
  // When placement suppresses the widget's own logo, the SSR'd widget needs
  // a theme with `widget.logo_position = "none"` — re-stringify if the
  // caller didn't already do this transform.
  const { logoPosition: derivedPosition, theme: themeForWidget } =
    derivePageLogoPlacement(opts.theme);
  const themeJsonForSsr =
    themeForWidget !== opts.theme
      ? JSON.stringify(themeForWidget)
      : opts.themeJson;
  const widgetHtml = await renderWidgetSSR({
    screenId: opts.screenId,
    screenJson: opts.screenJson,
    brandingJson: opts.brandingJson,
    themeJson: themeJsonForSsr,
    state: opts.state,
    authParamsJson: opts.authParamsJson,
  });

  // Shared slot inputs for both the body-fragment and full-document paths.
  const slotOptions = opts.customTemplateBody
    ? {
        widgetHtml,
        screenId: opts.screenId,
        logoUrl: opts.branding?.logo_url,
        clientName: opts.clientName,
        darkMode: opts.darkMode ?? ("auto" as DarkModePreference),
        language: opts.language,
        availableLanguages: opts.availableLanguages,
        poweredBy: opts.poweredByLogo,
        termsAndConditionsUrl: opts.termsAndConditionsUrl,
        // Expose the full branding/theme objects as Liquid variables so
        // templates can reference e.g. `{{ branding.logo_url }}`.
        branding: opts.branding,
        theme: opts.theme,
        // Forward the same per-tenant CSS variables and responsive width
        // clamp the default layout applies, so custom templates don't lose
        // primary-color theming or the responsive widget width.
        widgetContainerStyle: buildWidgetContainerStyle(
          extractBrandingProps(opts.branding),
          opts.theme,
        ),
      }
    : undefined;

  // Full-document (Auth0-style) template: the tenant owns <html>/<head>/<body>.
  // Render it as the whole page, with `{%- auth0:head -%}` injecting the head
  // essentials. Body-fragment templates fall through to the fixed page shell.
  if (
    opts.customTemplateBody &&
    slotOptions &&
    templateIsFullDocument(opts.customTemplateBody)
  ) {
    const rendered = await applyUniversalLoginTemplate(
      opts.customTemplateBody,
      {
        ...slotOptions,
        headHtml: buildHeadEssentials({
          clientName: opts.clientName,
          branding: extractBrandingProps(opts.branding),
          theme: opts.theme,
        }),
      },
    );
    const doc = /^\s*<!doctype/i.test(rendered)
      ? rendered
      : `<!DOCTYPE html>${rendered}`;
    return ctx.html(doc);
  }

  let customBodyHtml: string | undefined;
  if (opts.customTemplateBody && slotOptions) {
    customBodyHtml = await applyUniversalLoginTemplate(
      opts.customTemplateBody,
      slotOptions,
    );
  }

  return ctx.html(
    <WidgetPage
      widgetHtml={widgetHtml}
      screenId={opts.screenId}
      branding={extractBrandingProps(opts.branding)}
      theme={opts.theme}
      themePageBackground={opts.theme?.page_background}
      clientName={opts.clientName}
      poweredByLogo={opts.poweredByLogo}
      language={opts.language}
      availableLanguages={opts.availableLanguages}
      termsAndConditionsUrl={opts.termsAndConditionsUrl}
      darkMode={opts.darkMode}
      logoPosition={opts.logoPosition ?? derivedPosition}
      extraScript={opts.extraScript}
      customBodyHtml={customBodyHtml}
    />,
  );
}
