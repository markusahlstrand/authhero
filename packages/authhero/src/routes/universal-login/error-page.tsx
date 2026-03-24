/**
 * Branded error page for universal login routes.
 *
 * Renders a user-friendly error page with tenant branding (logo, colors,
 * background) when available, falling back to the default theme.
 */

import {
  sanitizeUrl,
  sanitizeCssColor,
  buildThemePageBackground,
} from "./sanitization-utils";
import type { Theme } from "@authhero/adapter-interfaces";
import type { DarkModePreference } from "./u2-widget-page";

export type ErrorPageProps = {
  title?: string;
  message: string;
  statusCode: number;
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
  theme?: Theme | null;
  darkMode?: DarkModePreference;
};

export function ErrorPage({
  title = "Something went wrong",
  message,
  statusCode,
  branding,
  theme,
  darkMode = "auto",
}: ErrorPageProps) {
  const pageBackground = buildThemePageBackground(
    theme?.page_background,
    branding?.colors?.page_background,
  );
  const faviconUrl = sanitizeUrl(branding?.favicon_url);
  const fontUrl = sanitizeUrl(branding?.font?.url);
  const logoUrl = sanitizeUrl(branding?.logo_url);

  const widgetBackground =
    sanitizeCssColor(theme?.colors?.widget_background) || "#ffffff";
  const widgetCornerRadius = theme?.borders?.widget_corner_radius ?? 16;
  const showWidgetShadow = theme?.borders?.show_widget_shadow !== false;
  const errorColor = sanitizeCssColor(theme?.colors?.error) || "#DC2626";

  const htmlClass =
    darkMode === "dark"
      ? "ah-dark-mode"
      : darkMode === "light"
        ? "ah-light-mode"
        : undefined;

  return (
    <html lang="en" class={htmlClass}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Error - {statusCode}</title>
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
        {fontUrl && <link rel="stylesheet" href={fontUrl} />}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${pageBackground};
                font-family: ${fontUrl ? "'Inter', system-ui, sans-serif" : "system-ui, -apple-system, sans-serif"};
                padding: 20px;
              }
              .error-card {
                width: 400px;
                background: ${widgetBackground};
                border-radius: ${widgetCornerRadius}px;
                padding: 40px 32px;
                text-align: center;
                ${showWidgetShadow ? "box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);" : ""}
              }
              .error-logo {
                margin-bottom: 24px;
              }
              .error-logo img {
                max-height: 52px;
                max-width: 200px;
              }
              .error-icon {
                margin-bottom: 16px;
              }
              .error-title {
                font-size: 20px;
                font-weight: 600;
                color: #1a1a1a;
                margin-bottom: 12px;
              }
              .error-message {
                font-size: 15px;
                color: #666;
                line-height: 1.5;
              }
              /* Explicit dark mode */
              html.ah-dark-mode body { background: #111827 !important; }
              html.ah-dark-mode .error-card { background: #1f2937; }
              html.ah-dark-mode .error-title { color: #f9fafb; }
              html.ah-dark-mode .error-message { color: #9ca3af; }
              /* Auto mode: follow system preference */
              @media (prefers-color-scheme: dark) {
                html:not(.ah-light-mode) body { background: #111827 !important; }
                html:not(.ah-light-mode) .error-card { background: #1f2937; }
                html:not(.ah-light-mode) .error-title { color: #f9fafb; }
                html:not(.ah-light-mode) .error-message { color: #9ca3af; }
              }
              @media (max-width: 480px) {
                body { background: ${widgetBackground} !important; padding: 0 !important; }
                html.ah-dark-mode body { background: #111827 !important; }
                .error-card { box-shadow: none; border-radius: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
              }
              @media (max-width: 480px) and (prefers-color-scheme: dark) {
                html:not(.ah-light-mode) body { background: #111827 !important; }
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="error-card">
          {logoUrl && (
            <div class="error-logo">
              <img src={logoUrl} alt="Logo" />
            </div>
          )}
          <div class="error-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke={errorColor}
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div class="error-title">{title}</div>
          <div class="error-message">{message}</div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem('ah-dark-mode');if(p!==null&&!document.cookie.match(/ah-dark-mode=/)){var v=p==='1'?'dark':'light';document.cookie='ah-dark-mode='+v+';path=/;max-age=31536000;SameSite=Lax';localStorage.removeItem('ah-dark-mode')}}catch(e){}})()`,
          }}
        />
      </body>
    </html>
  );
}
