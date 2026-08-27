/**
 * Signed-in landing page for the /u2/info test redirect target.
 *
 * Shows the outcome of a server-side authorization code exchange: buttons
 * that copy the issued tokens to the clipboard, and a grid with the claims
 * from the ID token (or the user's profile when no ID token was issued).
 */

import type { Theme, TokenResponse, User } from "@authhero/adapter-interfaces";
import { decodeBase64UrlString } from "@authhero/adapter-interfaces";
import {
  sanitizeUrl,
  sanitizeCssColor,
  buildThemePageBackground,
} from "./sanitization-utils";
import type { DarkModePreference } from "./u2-widget-page";
import type { ErrorPageProps } from "./error-page";

export type TokenInfoPageProps = {
  tokens: TokenResponse;
  user: User;
  branding?: ErrorPageProps["branding"];
  theme?: Theme | null;
  darkMode?: DarkModePreference;
};

type ClaimRow = { key: string; value: string };

const TIMESTAMP_CLAIMS = new Set([
  "exp",
  "iat",
  "nbf",
  "auth_time",
  "updated_at",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decode a JWT payload without verifying it — the server just minted it. */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(decodeBase64UrlString(parts[1]));
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function formatClaimValue(key: string, value: unknown): string {
  if (typeof value === "number" && TIMESTAMP_CLAIMS.has(key)) {
    return `${value} (${new Date(value * 1000).toISOString()})`;
  }
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function toClaimRows(source: Record<string, unknown>): ClaimRow[] {
  return Object.entries(source)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: formatClaimValue(key, value) }));
}

/** Profile fields shown when no ID token was issued (no `openid` scope). */
const PROFILE_FIELDS: (keyof User)[] = [
  "user_id",
  "email",
  "email_verified",
  "phone_number",
  "name",
  "given_name",
  "family_name",
  "nickname",
  "picture",
  "connection",
  "provider",
];

export function buildClaimRows(tokens: TokenResponse, user: User): ClaimRow[] {
  const payload = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  if (payload) return toClaimRows(payload);
  const profile: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    profile[field] = user[field];
  }
  return toClaimRows(profile);
}

const COPY_SCRIPT = `(function(){
  function fallbackCopy(text){
    var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');
    ta.style.position='fixed';ta.style.top='-1000px';document.body.appendChild(ta);ta.select();
    var ok=false;try{ok=document.execCommand('copy')}catch(e){}
    document.body.removeChild(ta);return ok;
  }
  function flash(btn,label){
    var original=btn.textContent;btn.textContent=label;btn.classList.add('is-copied');
    setTimeout(function(){btn.textContent=original;btn.classList.remove('is-copied')},1500);
  }
  var buttons=document.querySelectorAll('[data-copy-token]');
  for(var i=0;i<buttons.length;i++){
    buttons[i].addEventListener('click',function(ev){
      var btn=ev.currentTarget;var text=btn.getAttribute('data-copy-token')||'';
      var done=function(ok){flash(btn,ok?'Copied!':'Copy failed')};
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){done(true)},function(){done(fallbackCopy(text))});
      }else{done(fallbackCopy(text))}
    });
  }
})()`;

const DARK_MODE_MIGRATION_SCRIPT = `(function(){try{var p=localStorage.getItem('ah-dark-mode');if(p!==null&&!document.cookie.match(/ah-dark-mode=/)){var v=p==='1'?'dark':'light';document.cookie='ah-dark-mode='+v+';path=/;max-age=31536000;SameSite=Lax';localStorage.removeItem('ah-dark-mode')}}catch(e){}})()`;

export function TokenInfoPage({
  tokens,
  user,
  branding,
  theme,
  darkMode = "auto",
}: TokenInfoPageProps) {
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
  const primaryColor =
    sanitizeCssColor(theme?.colors?.primary_button) ||
    sanitizeCssColor(branding?.colors?.primary) ||
    "#2563EB";
  const primaryLabel =
    sanitizeCssColor(theme?.colors?.primary_button_label) || "#ffffff";

  const htmlClass =
    darkMode === "dark"
      ? "ah-dark-mode"
      : darkMode === "light"
        ? "ah-light-mode"
        : undefined;

  const claims = buildClaimRows(tokens, user);
  const tokenButtons: { label: string; token: string }[] = [
    ...(tokens.id_token ? [{ label: "ID token", token: tokens.id_token }] : []),
    { label: "Access token", token: tokens.access_token },
    ...(tokens.refresh_token
      ? [{ label: "Refresh token", token: tokens.refresh_token }]
      : []),
  ];
  const details: ClaimRow[] = [
    { key: "token_type", value: tokens.token_type },
    ...(tokens.scope ? [{ key: "scope", value: tokens.scope }] : []),
    { key: "expires_in", value: `${tokens.expires_in}s` },
  ];

  return (
    <html lang="en" class={htmlClass}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Signed in</title>
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
                color: #1a1a1a;
              }
              .info-card {
                width: 100%;
                max-width: 640px;
                background: ${widgetBackground};
                border-radius: ${widgetCornerRadius}px;
                padding: 40px 32px;
                ${showWidgetShadow ? "box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);" : ""}
              }
              .info-logo { margin-bottom: 24px; text-align: center; }
              .info-logo img { max-height: 52px; max-width: 200px; }
              .info-icon { margin-bottom: 16px; text-align: center; }
              .info-title { font-size: 20px; font-weight: 600; text-align: center; margin-bottom: 8px; }
              .info-message { font-size: 15px; color: #666; line-height: 1.5; text-align: center; margin-bottom: 24px; }
              .info-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 28px; }
              .copy-button {
                appearance: none;
                border: 1px solid ${primaryColor};
                background: ${primaryColor};
                color: ${primaryLabel};
                border-radius: 8px;
                padding: 10px 16px;
                font: inherit;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                min-width: 140px;
              }
              .copy-button:hover { filter: brightness(1.1); }
              .copy-button:focus-visible { outline: 2px solid ${primaryColor}; outline-offset: 2px; }
              .copy-button.is-copied { background: #16a34a; border-color: #16a34a; color: #ffffff; }
              .info-section-title {
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #666;
                margin-bottom: 8px;
              }
              .claims-grid {
                display: grid;
                grid-template-columns: minmax(120px, max-content) 1fr;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
                font-size: 13px;
                margin-bottom: 24px;
              }
              .claims-grid > div {
                padding: 8px 12px;
                border-bottom: 1px solid #e5e7eb;
                overflow-wrap: anywhere;
              }
              .claims-grid > div:nth-last-child(-n+2) { border-bottom: none; }
              .claim-key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #666; background: #f9fafb; }
              .claim-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
              .raw-tokens summary { cursor: pointer; font-size: 13px; color: #666; }
              .raw-tokens pre {
                margin-top: 8px;
                padding: 12px;
                background: #f3f4f6;
                border-radius: 8px;
                font-size: 11px;
                line-height: 1.4;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
              }
              .raw-tokens .raw-label { font-size: 12px; font-weight: 600; margin-top: 12px; }
              /* Explicit dark mode */
              html.ah-dark-mode body { background: #111827 !important; color: #f9fafb; }
              html.ah-dark-mode .info-card { background: #1f2937; }
              html.ah-dark-mode .info-message, html.ah-dark-mode .info-section-title, html.ah-dark-mode .claim-key, html.ah-dark-mode .raw-tokens summary { color: #9ca3af; }
              html.ah-dark-mode .claims-grid, html.ah-dark-mode .claims-grid > div { border-color: #374151; }
              html.ah-dark-mode .claim-key { background: #111827; }
              html.ah-dark-mode .raw-tokens pre { background: #111827; }
              /* Auto mode: follow system preference */
              @media (prefers-color-scheme: dark) {
                html:not(.ah-light-mode) body { background: #111827 !important; color: #f9fafb; }
                html:not(.ah-light-mode) .info-card { background: #1f2937; }
                html:not(.ah-light-mode) .info-message, html:not(.ah-light-mode) .info-section-title, html:not(.ah-light-mode) .claim-key, html:not(.ah-light-mode) .raw-tokens summary { color: #9ca3af; }
                html:not(.ah-light-mode) .claims-grid, html:not(.ah-light-mode) .claims-grid > div { border-color: #374151; }
                html:not(.ah-light-mode) .claim-key { background: #111827; }
                html:not(.ah-light-mode) .raw-tokens pre { background: #111827; }
              }
              @media (max-width: 480px) {
                body { background: ${widgetBackground} !important; padding: 0 !important; }
                html.ah-dark-mode body { background: #111827 !important; }
                .info-card { box-shadow: none; border-radius: 0; min-height: 100vh; }
                .claims-grid { grid-template-columns: 1fr; }
                .claims-grid > div:nth-last-child(-n+2) { border-bottom: 1px solid #e5e7eb; }
                .claims-grid > div:last-child { border-bottom: none; }
              }
              @media (max-width: 480px) and (prefers-color-scheme: dark) {
                html:not(.ah-light-mode) body { background: #111827 !important; }
              }
            `,
          }}
        />
      </head>
      <body>
        <div class="info-card">
          {logoUrl && (
            <div class="info-logo">
              <img src={logoUrl} alt="Logo" />
            </div>
          )}
          <div class="info-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke={primaryColor}
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12.5l2.5 2.5L16 9.5" />
            </svg>
          </div>
          <div class="info-title">Signed in</div>
          <div class="info-message">
            You have signed in successfully. The authorization code was
            exchanged for tokens.
          </div>

          <div class="info-actions">
            {tokenButtons.map(({ label, token }) => (
              <button
                type="button"
                class="copy-button"
                data-copy-token={token}
                aria-label={`Copy ${label.toLowerCase()} to clipboard`}
              >
                Copy {label.toLowerCase()}
              </button>
            ))}
          </div>

          <div class="info-section-title">User</div>
          <div class="claims-grid">
            {claims.map(({ key, value }) => (
              <>
                <div class="claim-key">{key}</div>
                <div class="claim-value">{value}</div>
              </>
            ))}
          </div>

          <div class="info-section-title">Token</div>
          <div class="claims-grid">
            {details.map(({ key, value }) => (
              <>
                <div class="claim-key">{key}</div>
                <div class="claim-value">{value}</div>
              </>
            ))}
          </div>

          <details class="raw-tokens">
            <summary>Show raw tokens</summary>
            {tokenButtons.map(({ label, token }) => (
              <>
                <div class="raw-label">{label}</div>
                <pre>{token}</pre>
              </>
            ))}
          </details>
        </div>
        <script dangerouslySetInnerHTML={{ __html: COPY_SCRIPT }} />
        <script
          dangerouslySetInnerHTML={{ __html: DARK_MODE_MIGRATION_SCRIPT }}
        />
      </body>
    </html>
  );
}
