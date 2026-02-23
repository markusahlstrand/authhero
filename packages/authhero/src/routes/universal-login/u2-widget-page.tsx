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
}: WidgetPageProps) {
  // Build CSS variables from branding
  const cssVariables: string[] = [];
  const primaryColor = sanitizeCssColor(branding?.colors?.primary);
  if (primaryColor) {
    cssVariables.push(`--ah-color-primary: ${primaryColor}`);
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
      ? cssVariables.join("; ") + "; max-width: 400px; width: 100%;"
      : "max-width: 400px; width: 100%;";

  return (
    <html lang="en">
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
              .powered-by { position: fixed; bottom: 16px; left: 16px; opacity: 0.7; transition: opacity 0.2s; }
              .powered-by:hover { opacity: 1; }
              .powered-by img { display: block; }
              .page-footer-left { position: fixed; bottom: 16px; left: 16px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; z-index: 10; }
              .terms-link { font-size: 12px; color: rgba(0,0,0,0.45); text-decoration: none; transition: color 0.2s; }
              .terms-link:hover { color: rgba(0,0,0,0.7); text-decoration: underline; }
              html.ah-dark-mode .terms-link { color: rgba(255,255,255,0.45); }
              html.ah-dark-mode .terms-link:hover { color: rgba(255,255,255,0.7); }
              .page-footer { position: fixed; bottom: 16px; right: 16px; display: flex; align-items: center; gap: 12px; z-index: 10; }
              .language-picker { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 6px 10px; font-size: 13px; color: #555; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; }
              .language-picker:hover { border-color: rgba(0,0,0,0.2); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
              .language-icon { flex-shrink: 0; opacity: 0.6; }
              .language-select { appearance: none; -webkit-appearance: none; background: none; border: none; font: inherit; color: inherit; cursor: pointer; padding-right: 2px; outline: none; }
              .dark-mode-toggle { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 7px; color: #555; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; }
              .dark-mode-toggle:hover { border-color: rgba(0,0,0,0.2); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
              html.ah-dark-mode body::before { content: ''; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 0; pointer-events: none; }
              html.ah-dark-mode .widget-container { position: relative; z-index: 1; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
              html.ah-dark-mode .page-footer-left { z-index: 10; }
              html.ah-dark-mode .page-footer { z-index: 10; }
              html.ah-dark-mode .page-footer .language-picker, html.ah-dark-mode .page-footer .dark-mode-toggle { background: rgba(30,30,50,0.9); border-color: rgba(255,255,255,0.15); color: #ccc; }
              html.ah-dark-mode .page-footer .language-picker:hover, html.ah-dark-mode .page-footer .dark-mode-toggle:hover { border-color: rgba(255,255,255,0.3); }
              @media (max-width: 560px) {
                body { justify-content: center !important; padding: 20px !important; }
              }
              @media (max-width: 480px) {
                body { background: ${widgetBackground} !important; padding: 0 !important; }
                .widget-container { max-width: none; }
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
          data-screen={screenId}
          style={widgetContainerStyle}
          dangerouslySetInnerHTML={{ __html: widgetHtml }}
        />
        {(safePoweredByUrl || termsAndConditionsUrl) && (
          <div class="page-footer-left">
            {safePoweredByUrl && (
              <div class="powered-by" style="position:static;">
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
                Terms and Conditions
              </a>
            )}
          </div>
        )}
        <footer>
          <div class="page-footer">
            <button
              class="dark-mode-toggle"
              type="button"
              aria-label="Toggle dark mode"
              onclick={`(function(btn){var h=document.documentElement,isDark=h.classList.toggle('ah-dark-mode');var v={'--ah-color-text':'#f9fafb','--ah-color-text-muted':'#9ca3af','--ah-color-text-label':'#d1d5db','--ah-color-header':'#f9fafb','--ah-color-bg':'rgba(31,41,55,0.85)','--ah-color-bg-hover':'rgba(55,65,81,0.85)','--ah-color-bg-muted':'rgba(55,65,81,0.85)','--ah-color-bg-disabled':'#4b5563','--ah-color-input-bg':'rgba(55,65,81,0.7)','--ah-color-border':'#4b5563','--ah-color-border-hover':'#6b7280','--ah-color-border-muted':'#374151','--ah-color-error-bg':'rgba(220,38,38,0.2)','--ah-color-success-bg':'rgba(22,163,74,0.2)'};for(var k in v){if(isDark)h.style.setProperty(k,v[k]);else h.style.removeProperty(k)}btn.querySelector('.icon-sun').style.display=isDark?'none':'block';btn.querySelector('.icon-moon').style.display=isDark?'block':'none';try{localStorage.setItem('ah-dark-mode',isDark?'1':'0')}catch(e){}})(this)`}
            >
              <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            </button>
            {availableLanguages && availableLanguages.length > 1 && (
              <div class="language-picker">
                <svg class="language-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
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
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var h=document.documentElement;var pref=localStorage.getItem('ah-dark-mode');var isDark=pref==='1'||(pref===null&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(isDark){h.classList.add('ah-dark-mode');var v={'--ah-color-text':'#f9fafb','--ah-color-text-muted':'#9ca3af','--ah-color-text-label':'#d1d5db','--ah-color-header':'#f9fafb','--ah-color-bg':'rgba(31,41,55,0.85)','--ah-color-bg-hover':'rgba(55,65,81,0.85)','--ah-color-bg-muted':'rgba(55,65,81,0.85)','--ah-color-bg-disabled':'#4b5563','--ah-color-input-bg':'rgba(55,65,81,0.7)','--ah-color-border':'#4b5563','--ah-color-border-hover':'#6b7280','--ah-color-border-muted':'#374151','--ah-color-error-bg':'rgba(220,38,38,0.2)','--ah-color-success-bg':'rgba(22,163,74,0.2)'};for(var k in v)h.style.setProperty(k,v[k]);var btn=document.querySelector('.dark-mode-toggle');if(btn){btn.querySelector('.icon-sun').style.display='none';btn.querySelector('.icon-moon').style.display='block'}}}catch(e){}})()` }} />
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
  const { screenId, screenJson, brandingJson, themeJson, state, authParamsJson } =
    params;

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
    />,
  );
}
