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
  escapeHtml,
} from "./sanitization-utils";
/**
 * Page chrome lives in the widget package so the demo server renders the
 * exact same CSS and markup this page does. It used to be defined here and
 * hand-mirrored in the demo, which drifted (the phone layout was wrong in one
 * and not the other). Everything below is framework-free: strings in, strings
 * out — this module resolves i18n and hands over finished labels.
 */
import {
  buildBodyLayout,
  buildPageCss,
  renderLogoChip,
  renderSettingsChip,
  renderPoweredByChip,
  renderLegalChip,
  renderMobileFooter,
  DARK_MODE_CSS_VARS,
  darkContrastRatio,
  lightenHexDark,
} from "@authhero/widget/page-chrome";
import type {
  DarkModePreference,
  LogoPosition,
  LanguageOption,
} from "@authhero/widget/page-chrome";
export type {
  DarkModePreference,
  LogoPosition,
  ChipStyle,
  LanguageOption,
} from "@authhero/widget/page-chrome";
import type { Branding, Theme } from "@authhero/adapter-interfaces";
import { getCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { buildHash } from "../../build-hash";
import { createTranslation, getLocaleDisplayName } from "../../i18n";
import { resolveLocaleFromContext } from "../../utils/locale";
import {
  applyUniversalLoginTemplate,
  templateIsFullDocument,
} from "./universal-login-template";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// i18n bridge for the shared chrome
//
// The chrome renderers in @authhero/widget/page-chrome take finished strings
// so they don't depend on authhero's i18n stack. These two helpers resolve
// the only labels the chrome needs.
// ---------------------------------------------------------------------------

/** Localized display names for the language picker, in the given order. */
export function buildLanguageOptions(
  availableLanguages?: string[],
): LanguageOption[] | undefined {
  if (!availableLanguages) return undefined;
  return availableLanguages.map((value) => ({
    value,
    label: getLocaleDisplayName(value),
  }));
}

/** The short "Terms & Privacy" label, in the page's language. */
export function resolveTermsLabel(language?: string): string {
  const { m: commonT } = createTranslation(
    "common",
    "common",
    language || "en",
  );
  return commonT.termsShortText();
}

// ---------------------------------------------------------------------------
// Widget container style
// ---------------------------------------------------------------------------

/**
 * Build the inline `style` value for the widget container: the per-tenant CSS
 * variables, and nothing else. Custom templates inject the widget into a
 * tenant-controlled body fragment, so these have to be forwarded or
 * primary-color theming is lost on the custom-template path.
 *
 * The responsive width lives in the stylesheet (`.widget-container` in
 * `buildPageCss`) rather than here. It is identical for every tenant, and an
 * inline declaration would outrank the phone breakpoints that override it —
 * which is what forced the whole mobile block to shout with !important.
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
  return cssVariables.join("; ");
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
  // Full-document templates own `<body>`, so the page layout has to come from
  // the stylesheet — otherwise the widget renders top-left on a bare white
  // page ("no styles"). This centers it on the page background, matching what
  // Auth0's own `auth0:head` ships.
  const bodyLayout = buildBodyLayout({
    themePageBackground: opts.theme?.page_background,
    brandingPageBackground: opts.branding?.colors?.page_background,
    fontUrl,
  });
  const pageCss = buildPageCss({
    primaryColor,
    themePrimary,
    widgetBackground,
    hasBgImage: !!opts.theme?.page_background?.background_image_url,
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
  // Emitted into the stylesheet by `buildPageCss` below, exactly as on the
  // full-document path — one mechanism, so the phone breakpoints override it
  // by plain cascade instead of having to outrank an inline declaration.
  const bodyLayout = buildBodyLayout({
    themePageBackground,
    brandingPageBackground: branding?.colors?.page_background,
    fontUrl,
  });

  // ---- Sanitize logo URL ----
  const safeLogoUrl = branding?.logo_url
    ? sanitizeUrl(branding.logo_url)
    : null;

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
    hasBgImage,
    bodyLayout,
  });

  // -------------------------------------------------------------------------
  // Logo render helper — page-level chip variant only. The "widget" position
  // is rendered by the widget's own shadow DOM from `branding.logo_url`, so
  // the page doesn't emit a duplicate. The chip is hidden by CSS when
  // logoPosition === "widget".
  // -------------------------------------------------------------------------

  // i18n is resolved here, not in the chrome module: the shared renderers
  // take finished labels so they stay free of authhero's i18n stack.
  const languages = buildLanguageOptions(availableLanguages);
  const termsLabel = resolveTermsLabel(language);

  const chromeHtml =
    renderLogoChip({ logoUrl: safeLogoUrl, clientName }) +
    renderSettingsChip({ darkMode, language, languages }) +
    (poweredByLogo
      ? renderPoweredByChip({
          url: poweredByLogo.url,
          href: poweredByLogo.href,
          alt: poweredByLogo.alt,
          height: poweredByLogo.height,
        })
      : "") +
    renderLegalChip({ termsAndConditionsUrl, termsLabel }) +
    // Phone footer. Always emitted; CSS reveals it only under 480px, where
    // the corner chips are hidden because they'd overlap the full-screen card.
    renderMobileFooter({
      darkMode,
      language,
      languages,
      termsAndConditionsUrl,
      termsLabel,
      poweredBy: poweredByLogo,
    });

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
      <body>
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

            {/* Corner chips + the phone footer. The logo chip is hidden by
                CSS when data-logo-position="widget" (the default), and the
                chips and footer swap at the mobile breakpoint. */}
            <div
              style={{ display: "contents" }}
              dangerouslySetInnerHTML={{ __html: chromeHtml }}
            />
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
  /**
   * BCP-47 locale (region included) for locale-dependent field layout, e.g.
   * the segment order of DATE fields. Rendered into the element so the
   * hydrated widget resolves the same layout the server did.
   */
  locale?: string;
  /**
   * Keep the widget a floating card on phones (<=480px) instead of the
   * default full-bleed layout, so a page background image stays visible
   * around it. Set when `theme.page_background.background_image_url` is
   * present — see the mobile block in the widget's own stylesheet.
   */
  floating?: boolean;
}): Promise<string> {
  const {
    screenId,
    screenJson,
    brandingJson,
    themeJson,
    state,
    authParamsJson,
    locale,
    floating,
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
        ${locale ? `locale="${escapeHtml(locale)}"` : ""}
        ${floating ? "floating" : ""}
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
    /**
     * BCP-47 locale for field layout. Unlike `language` (the translation key,
     * region stripped) this keeps the region: en-GB renders DD/MM/YYYY where
     * en-US renders MM/DD/YYYY. Defaults to the request's locale.
     */
    locale?: string;
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
    /**
     * HTTP status for the response. Defaults to 200; pass 400 when
     * re-rendering a screen after a failed submission.
     */
    status?: ContentfulStatusCode;
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
    // Callers that already resolved a locale pass it; everyone else gets one
    // derived from the request, so no page renders without it.
    locale: opts.locale ?? resolveLocaleFromContext(ctx),
    // A page background image stays visible around the card on phones, so
    // the widget must not go full-bleed there — see buildPageCss's mobile
    // block and the widget stylesheet's `[floating]` variant.
    floating: !!opts.theme?.page_background?.background_image_url,
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
    return ctx.html(doc, opts.status);
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
    opts.status,
  );
}
