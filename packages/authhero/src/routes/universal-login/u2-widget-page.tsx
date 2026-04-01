/**
 * Shared widget page rendering for U2 routes.
 *
 * Contains the WidgetPage component, SSR rendering helper, and full-page
 * response builder used by both u2-routes and u2-form-node routes.
 */

import {
  sanitizeUrl,
  sanitizeCssColor,
  buildThemePageBackground,
  escapeHtml,
} from "./sanitization-utils";
import type { Branding, Theme } from "@authhero/adapter-interfaces";
import { buildHash } from "../../build-hash";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the WidgetPage component
 */
export type DarkModePreference = "auto" | "light" | "dark";

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
    alt: string;
    href?: string;
    height?: number;
  };
  language?: string;
  availableLanguages?: string[];
  termsAndConditionsUrl?: string;
  darkMode?: DarkModePreference;
  /** Optional inline script injected at page level (e.g. WebAuthn ceremony) */
  extraScript?: string;
};

// ---------------------------------------------------------------------------
// WidgetPage JSX component
// ---------------------------------------------------------------------------

/**
 * Language display names in their native language
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  nb: "Norsk",
  sv: "Svenska",
  da: "Dansk",
  fi: "Suomi",
  cs: "Čeština",
  pl: "Polski",
  it: "Italiano",
};

/**
 * Localized "Terms and Conditions" link text
 */
export const TERMS_TRANSLATIONS: Record<string, string> = {
  en: "Terms and Conditions",
  nb: "Vilkår",
  sv: "Villkor",
  da: "Vilkår og betingelser",
  fi: "Ehdot ja edellytykset",
  cs: "Podmínky a pravidla",
  pl: "Zasady i warunki",
  it: "Termini e condizioni",
};

/**
 * Dark mode CSS custom property values used by the widget and page.
 */
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

// Inline contrast helpers for dark mode CSS generation
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

/**
 * Generate CSS rules for dark mode variables on a selector.
 * When a primaryColor is provided, ensures the primary button has
 * adequate contrast against the dark widget background.
 */
function darkModeCssVarRules(selector: string, primaryColor?: string): string {
  const vars: Record<string, string> = { ...DARK_MODE_CSS_VARS };

  if (primaryColor) {
    const darkBg = DARK_MODE_CSS_VARS["--ah-color-bg"] || "#1f2937";

    // If primary button is too dark for the dark background, lighten it
    if (darkContrastRatio(primaryColor, darkBg) < 3) {
      let adjusted = primaryColor;
      for (let i = 1; i <= 10; i++) {
        adjusted = lightenHexDark(primaryColor, i * 0.1);
        if (darkContrastRatio(adjusted, darkBg) >= 3) break;
      }
      vars["--ah-color-primary"] = adjusted;
      vars["--ah-color-primary-hover"] = adjusted;
    }

    // Auto-compute text-on-primary for dark mode (BIAS matches SSR block)
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

/**
 * Widget page component – renders the full HTML page with the SSR widget.
 */
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
  extraScript,
}: WidgetPageProps) {
  // Build CSS variables from branding
  const cssVariables: string[] = [];
  const primaryColor = sanitizeCssColor(branding?.colors?.primary);
  if (primaryColor) {
    cssVariables.push(`--ah-color-primary: ${primaryColor}`);
  }

  // Compute text-on-primary for SSR (the widget computes this client-side,
  // but before hydration the CSS variable is missing and the button inherits
  // the dark body text color instead of using the fallback).
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

  const pageBackground = buildThemePageBackground(
    themePageBackground,
    branding?.colors?.page_background,
  );
  const faviconUrl = sanitizeUrl(branding?.favicon_url);
  const fontUrl = sanitizeUrl(branding?.font?.url);

  // Get widget background color for mobile view
  const widgetBackground =
    sanitizeCssColor(theme?.colors?.widget_background) || "#ffffff";

  // Sanitize powered-by logo URLs
  const safePoweredByUrl = poweredByLogo?.url
    ? sanitizeUrl(poweredByLogo.url)
    : null;
  const safePoweredByHref = poweredByLogo?.href
    ? sanitizeUrl(poweredByLogo.href)
    : null;

  // Determine justify-content based on page_layout
  const pageLayout = themePageBackground?.page_layout || "center";
  const justifyContent =
    pageLayout === "left"
      ? "flex-start"
      : pageLayout === "right"
        ? "flex-end"
        : "center";
  // Adjust padding based on page_layout
  const padding =
    pageLayout === "left"
      ? "20px 20px 20px 80px"
      : pageLayout === "right"
        ? "20px 80px 20px 20px"
        : "20px";

  const bodyStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent,
    background: pageBackground,
    fontFamily: fontUrl
      ? "'Inter', system-ui, sans-serif"
      : "system-ui, -apple-system, sans-serif",
    padding,
  };

  const widgetContainerStyle =
    cssVariables.length > 0
      ? cssVariables.join("; ") + "; width: clamp(320px, 100%, 400px);"
      : "width: clamp(320px, 100%, 400px);";

  const htmlClass =
    darkMode === "dark"
      ? "ah-dark-mode"
      : darkMode === "light"
        ? "ah-light-mode"
        : undefined;

  // Build dark mode CSS vars JSON for the client-side toggle script.
  // This includes any primary color contrast adjustments.
  const darkVarsForScript: Record<string, string> = {
    ...DARK_MODE_CSS_VARS,
  };
  const effectivePrimary =
    sanitizeCssColor(theme?.colors?.primary_button) || primaryColor;
  if (effectivePrimary) {
    const darkBg = DARK_MODE_CSS_VARS["--ah-color-bg"] || "#1f2937";
    if (darkContrastRatio(effectivePrimary, darkBg) < 3) {
      let adjusted = effectivePrimary;
      for (let i = 1; i <= 10; i++) {
        adjusted = lightenHexDark(effectivePrimary, i * 0.1);
        if (darkContrastRatio(adjusted, darkBg) >= 3) break;
      }
      darkVarsForScript["--ah-color-primary"] = adjusted;
      darkVarsForScript["--ah-color-primary-hover"] = adjusted;
    }
    const BIAS = 1.35;
    const btnBg = darkVarsForScript["--ah-color-primary"] || effectivePrimary;
    const wc = darkContrastRatio(btnBg, "#ffffff");
    const bc = darkContrastRatio(btnBg, "#000000");
    darkVarsForScript["--ah-color-text-on-primary"] =
      bc > wc * BIAS ? "#000000" : "#ffffff";
  }
  const darkVarsJson = JSON.stringify(darkVarsForScript);

  return (
    <html lang={language || "en"} class={htmlClass}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sign in - {clientName}</title>
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
        {fontUrl && <link rel="stylesheet" href={fontUrl} />}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              * { box-sizing: border-box; margin: 0; padding: 0; }
              .page-footer-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 8px 20px; background: rgba(255,255,255,0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-top: 1px solid rgba(0,0,0,0.08); color: #333; font-size: 13px; }
              .footer-left, .footer-right { display: flex; align-items: center; gap: 12px; }
              .powered-by { opacity: 0.7; transition: opacity 0.2s; line-height: 0; }
              .powered-by:hover { opacity: 1; }
              .powered-by img { display: block; }
              .terms-link { font-size: 12px; color: inherit; opacity: 0.65; text-decoration: none; transition: opacity 0.2s; }
              .terms-link:hover { opacity: 1; text-decoration: underline; }
              .language-picker { display: flex; align-items: center; gap: 6px; background: none; border: none; padding: 0; font-size: 13px; color: inherit; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; }
              .language-picker:hover { opacity: 1; }
              .language-icon { flex-shrink: 0; opacity: 0.6; }
              .language-select { appearance: none; -webkit-appearance: none; background: none; border: none; font: inherit; color: inherit; cursor: pointer; padding-right: 2px; outline: none; }
              .dark-mode-toggle { display: flex; align-items: center; justify-content: center; background: none; border: none; padding: 4px; color: inherit; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; border-radius: 4px; }
              .dark-mode-toggle:hover { opacity: 1; }

              /* Explicit dark mode */
              html.ah-dark-mode body { background: #111827 !important; }
              html.ah-dark-mode .widget-container { position: relative; z-index: 1; }
              html.ah-dark-mode .page-footer-bar { background: rgba(0,0,0,0.5); border-top-color: rgba(255,255,255,0.08); color: #eee; }
              ${darkModeCssVarRules("html.ah-dark-mode authhero-widget", primaryColor || sanitizeCssColor(theme?.colors?.primary_button))}

              /* Auto mode: follow system preference, unless explicitly set to light */
              @media (prefers-color-scheme: dark) {
                html:not(.ah-light-mode) body { background: #111827 !important; }
                html:not(.ah-light-mode) .widget-container { position: relative; z-index: 1; }
                html:not(.ah-light-mode) .page-footer-bar { background: rgba(0,0,0,0.5); border-top-color: rgba(255,255,255,0.08); color: #eee; }
                ${darkModeCssVarRules("html:not(.ah-light-mode) authhero-widget", primaryColor || sanitizeCssColor(theme?.colors?.primary_button))}
              }

              @media (max-width: 560px) {
                body { justify-content: center !important; padding: 20px 20px 52px !important; }
              }
              @media (max-width: 480px) {
                body { background: ${widgetBackground} !important; padding: 0 0 44px !important; }
                html.ah-dark-mode body { background: #111827 !important; }
                .widget-container { width: 100%; }
                .page-footer-bar { background: ${widgetBackground}; backdrop-filter: none; -webkit-backdrop-filter: none; border-top: 1px solid rgba(0,0,0,0.08); }
                html.ah-dark-mode .page-footer-bar { background: #111827; border-top-color: rgba(255,255,255,0.08); }
              }
              @media (max-width: 480px) and (prefers-color-scheme: dark) {
                html:not(.ah-light-mode) body { background: #111827 !important; }
                html:not(.ah-light-mode) .page-footer-bar { background: #111827; border-top-color: rgba(255,255,255,0.08); }
              }
            `,
          }}
        />
        <script
          type="module"
          src={`/u/widget/authhero-widget.esm.js?v=${buildHash}`}
        />
      </head>
      <body style={bodyStyle}>
        {/* SSR widget - rendered server-side, hydrated on client */}
        {/* data-screen attribute allows CSS targeting for specific screens */}
        <div
          class="widget-container"
          data-authhero-widget-container
          data-screen={screenId}
          style={widgetContainerStyle}
          dangerouslySetInnerHTML={{ __html: widgetHtml }}
        />
        {extraScript && (
          <script dangerouslySetInnerHTML={{ __html: extraScript }} />
        )}
        <footer class="page-footer-bar">
          <div class="footer-left">
            {safePoweredByUrl && (
              <div class="powered-by">
                {safePoweredByHref ? (
                  <a
                    href={safePoweredByHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={safePoweredByUrl}
                      alt={poweredByLogo?.alt || ""}
                      height={poweredByLogo?.height || 20}
                    />
                  </a>
                ) : (
                  <img
                    src={safePoweredByUrl}
                    alt={poweredByLogo?.alt || ""}
                    height={poweredByLogo?.height || 20}
                  />
                )}
              </div>
            )}
            {termsAndConditionsUrl && (
              <a
                class="terms-link"
                href={termsAndConditionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {TERMS_TRANSLATIONS[language || "en"] || TERMS_TRANSLATIONS.en}
              </a>
            )}
          </div>
          <div class="footer-right">
            <button
              class="dark-mode-toggle"
              type="button"
              aria-label="Toggle dark mode"
              onclick={`(function(btn){var h=document.documentElement;var cur=h.classList.contains('ah-dark-mode')?'dark':h.classList.contains('ah-light-mode')?'light':'auto';var next=cur==='auto'?'dark':cur==='dark'?'light':'auto';h.classList.remove('ah-dark-mode','ah-light-mode');if(next==='dark')h.classList.add('ah-dark-mode');else if(next==='light')h.classList.add('ah-light-mode');btn.querySelector('.icon-sun').style.display=next==='light'?'block':'none';btn.querySelector('.icon-moon').style.display=next==='dark'?'block':'none';btn.querySelector('.icon-auto').style.display=next==='auto'?'block':'none';document.cookie='ah-dark-mode='+next+';path=/;max-age=31536000;SameSite=Lax';if(window.__ahDarkMode){window.__ahDarkMode(next)}})(this)`}
            >
              {/* Auto icon (half circle - system preference) */}
              <svg
                class="icon-auto"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style={darkMode === "auto" ? undefined : "display:none"}
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" />
              </svg>
              {/* Sun icon (light mode) */}
              <svg
                class="icon-sun"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
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
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              {/* Moon icon (dark mode) */}
              <svg
                class="icon-moon"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style={darkMode === "dark" ? undefined : "display:none"}
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
            {availableLanguages && availableLanguages.length > 1 && (
              <div class="language-picker">
                <svg
                  class="language-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <select
                  class="language-select"
                  onchange={`var p=new URLSearchParams(window.location.search);p.set('ui_locales',this.value);window.location.search=p.toString()`}
                >
                  {availableLanguages.map((lang) => (
                    <option value={lang} selected={lang === language}>
                      {LANGUAGE_NAMES[lang] || lang}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </footer>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
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
})()`,
          }}
        />
      </body>
    </html>
  );
}

// ---------------------------------------------------------------------------
// SSR rendering helper
// ---------------------------------------------------------------------------

/**
 * Server-side render the authhero-widget and return the HTML string.
 *
 * Returns an empty string when SSR is not available (e.g. Cloudflare Workers)
 * so the widget falls back to client-side hydration.
 */
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
    // Essential for some internal Stencil checks in edge runtimes
    if (typeof (globalThis as any).window === "undefined") {
      (globalThis as any).window = globalThis;
    }

    const { renderToString } = await import("@authhero/widget/hydrate");
    const result = await renderToString(
      `<authhero-widget
        id="widget"
        data-screen="${escapeHtml(screenId)}"
        screen='${screenJson.replace(/'/g, "&#39;")}'
        ${brandingJson ? `branding='${brandingJson.replace(/'/g, "&#39;")}'` : ""}
        ${themeJson ? `theme='${themeJson.replace(/'/g, "&#39;")}'` : ""}
        state="${escapeHtml(state)}"
        auth-params='${authParamsJson.replace(/'/g, "&#39;")}'
        auto-submit="true"
        auto-navigate="true"
      ></authhero-widget>`,
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

/**
 * Extract the subset of Branding properties needed by WidgetPage.
 */
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

/**
 * Render a full widget page response (SSR + WidgetPage).
 *
 * This is the common path used by both u2-routes and u2-form-node when
 * returning a complete HTML page (no custom Liquid template).
 */
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
  },
): Promise<Response> {
  const widgetHtml = await renderWidgetSSR({
    screenId: opts.screenId,
    screenJson: opts.screenJson,
    brandingJson: opts.brandingJson,
    themeJson: opts.themeJson,
    state: opts.state,
    authParamsJson: opts.authParamsJson,
  });

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
    />,
  );
}
