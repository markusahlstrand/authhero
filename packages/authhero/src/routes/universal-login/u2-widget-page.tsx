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
};

// ---------------------------------------------------------------------------
// WidgetPage JSX component
// ---------------------------------------------------------------------------

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
        <script type="module" src="/u/widget/authhero-widget.esm.js" />
      </head>
      <body style={bodyStyle}>
        {/* SSR widget - rendered server-side, hydrated on client */}
        {/* data-screen attribute allows CSS targeting for specific screens */}
        <div
          data-screen={screenId}
          style={widgetContainerStyle}
          dangerouslySetInnerHTML={{ __html: widgetHtml }}
        />
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
    />,
  );
}
