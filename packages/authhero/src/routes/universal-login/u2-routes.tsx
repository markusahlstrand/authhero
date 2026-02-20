/**
 * U2 Routes - Universal login with SSR + hydration + client-side navigation
 *
 * These routes serve HTML pages with server-side rendered authhero-widget
 * that hydrates on the client for interactivity and client-side navigation.
 *
 * Routes:
 * - GET /u2/login/identifier - Identifier screen (first screen of login flow)
 * - GET /u2/enter-code - OTP code verification
 * - GET /u2/enter-password - Password authentication
 * - GET /u2/signup - New user registration
 * - GET /u2/forgot-password - Password reset request
 * - GET /u2/reset-password - Set new password
 * - GET /u2/impersonate - User impersonation
 *
 * Each route:
 * 1. Fetches screen data server-side
 * 2. Server-side renders the widget with declarative shadow DOM
 * 3. Hydrates on client for interactivity
 * 4. Supports client-side navigation between screens
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import {
  getScreen,
  getScreenDefinition,
  listScreenIds,
} from "./screens/registry";
import type { ScreenContext } from "./screens/types";
import { HTTPException } from "hono/http-exception";
import {
  sanitizeUrl,
  sanitizeCssColor,
  buildThemePageBackground,
} from "./sanitization-utils";
import type { PromptScreen, CustomText } from "@authhero/adapter-interfaces";
import {
  WidgetPage,
  renderWidgetSSR,
  extractBrandingProps,
} from "./u2-widget-page";

/**
 * Mapping from screen IDs (used in routes) to prompt screen IDs (used for custom text)
 * This allows URLs like /u2/login/identifier to fetch custom text for "login-id"
 */
const SCREEN_TO_PROMPT_MAP: Record<string, PromptScreen> = {
  identifier: "login-id",
  login: "login", // Combined identifier + password screen
  "enter-password": "login-password",
  "enter-code": "login", // OTP code entry is part of login flow
  signup: "signup",
  "forgot-password": "reset-password",
  "reset-password": "reset-password",
  impersonate: "login",
  "pre-signup": "signup-id",
  "pre-signup-sent": "signup",
  consent: "consent",
  mfa: "mfa",
  "mfa-otp": "mfa-otp",
  "mfa-sms": "mfa-sms",
  "mfa-email": "mfa-email",
  "mfa-push": "mfa-push",
  "mfa-webauthn": "mfa-webauthn",
  "mfa-voice": "mfa-voice",
  "mfa-phone": "mfa-phone",
  "mfa-recovery-code": "mfa-recovery-code",
  status: "status",
  "device-flow": "device-flow",
  "email-verification": "email-verification",
  "email-otp-challenge": "email-otp-challenge",
  organizations: "organizations",
  invitation: "invitation",
};

/**
 * Get the prompt screen ID for a given screen ID
 */
function getPromptScreenForScreen(screenId: string): PromptScreen | undefined {
  return SCREEN_TO_PROMPT_MAP[screenId];
}

/**
 * Detect language from ui_locales parameter or Accept-Language header
 * Priority: ui_locales (from OAuth request) > Accept-Language header > "en"
 */
function detectLanguage(
  uiLocales: string | undefined,
  acceptLanguage: string | undefined,
): string {
  // First, try ui_locales from the OAuth authorization request
  if (uiLocales) {
    // ui_locales can contain multiple locales separated by spaces (e.g., "nb en")
    // Use the first one as the preferred language
    const firstLocale = uiLocales.split(" ")[0];
    if (firstLocale) {
      // Extract just the language code (e.g., "nb" from "nb-NO")
      const langCode = firstLocale.split("-")[0]?.toLowerCase();
      if (langCode) return langCode;
    }
  }

  // Fall back to Accept-Language header
  if (!acceptLanguage) return "en";

  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,es;q=0.8")
  const languages = acceptLanguage.split(",").map((lang) => {
    const [code, qValue] = lang.trim().split(";");
    const q = qValue ? parseFloat(qValue.split("=")[1] || "1") : 1;
    // Extract just the language code (e.g., "en" from "en-US")
    const langCode = code?.split("-")[0]?.toLowerCase() || "en";
    return { code: langCode, q };
  });

  // Sort by quality value and return the highest priority language
  languages.sort((a, b) => b.q - a.q);
  return languages[0]?.code || "en";
}

/**
 * Fetch custom text for a screen and language, with fallbacks
 */
async function fetchCustomText(
  ctx: any,
  tenantId: string,
  screenId: string,
  language: string,
): Promise<CustomText | undefined> {
  const promptScreen = getPromptScreenForScreen(screenId);
  if (!promptScreen) return undefined;

  try {
    // Try to get custom text for the specific prompt and language
    let customText = await ctx.env.data.customText.get(
      tenantId,
      promptScreen,
      language,
    );

    // If not found and language has a region (e.g., "en-US"), try base language
    if (!customText && language.includes("-")) {
      const baseLanguage = language.split("-")[0];
      customText = await ctx.env.data.customText.get(
        tenantId,
        promptScreen,
        baseLanguage!,
      );
    }

    // If still not found, try "common" prompts for shared texts
    if (!customText) {
      const commonText = await ctx.env.data.customText.get(
        tenantId,
        "common",
        language,
      );
      if (commonText) {
        customText = commonText;
      }
    }

    return customText || undefined;
  } catch (error) {
    // Custom text adapter may not exist - continue without custom text
    return undefined;
  }
}

/**
 * Props for generating head content
 */
type HeadContentProps = {
  clientName: string;
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
  themePageBackground?: {
    background_color?: string;
    background_image_url?: string;
    page_layout?: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme?: any;
};

/**
 * Head content component for liquid template substitution
 */
function HeadContent({
  clientName,
  branding,
  themePageBackground,
  theme,
}: HeadContentProps) {
  const faviconUrl = sanitizeUrl(branding?.favicon_url);
  const fontUrl = sanitizeUrl(branding?.font?.url);
  const primaryColor = sanitizeCssColor(branding?.colors?.primary);
  const pageBackground = buildThemePageBackground(
    themePageBackground,
    branding?.colors?.page_background,
  );

  // Get widget background color for mobile view
  const widgetBackground =
    sanitizeCssColor(theme?.colors?.widget_background) || "#ffffff";

  // Build CSS variables from branding
  const cssVariables: string[] = [];
  if (primaryColor) {
    cssVariables.push(`--ah-color-primary: ${primaryColor}`);
  }

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

  const styleContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: ${justifyContent};
      background: ${pageBackground};
      font-family: ${fontUrl ? "'Inter', system-ui, sans-serif" : "system-ui, -apple-system, sans-serif"};
      padding: ${padding};
    }
    
    .widget-container {
      display: flex;
      flex-direction: column;
      max-width: 400px;
      width: 100%;
    }
    
    authhero-widget {
      ${cssVariables.join(";\n      ")};
      width: 100%;
    }
    
    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    
    .error {
      background: #fee2e2;
      border: 1px solid #ef4444;
      color: #dc2626;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    
    .powered-by {
      margin-top: 16px;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    
    .powered-by:hover {
      opacity: 1;
    }
    
    .powered-by img {
      display: block;
    }
    
    .page-footer {
      position: fixed;
      bottom: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 10;
    }
    
    .language-picker {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 13px;
      color: #555;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    
    .language-picker:hover {
      border-color: rgba(0, 0, 0, 0.2);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    }
    
    .language-icon {
      flex-shrink: 0;
      opacity: 0.6;
    }
    
    .language-select {
      appearance: none;
      -webkit-appearance: none;
      background: none;
      border: none;
      font: inherit;
      color: inherit;
      cursor: pointer;
      padding-right: 2px;
      outline: none;
    }
    
    .dark-mode-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      padding: 7px;
      color: #555;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    
    .dark-mode-toggle:hover {
      border-color: rgba(0, 0, 0, 0.2);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    }
    
    html.ah-dark-mode body {
      background: #1a1a2e !important;
    }
    
    html.ah-dark-mode .page-footer .language-picker,
    html.ah-dark-mode .page-footer .dark-mode-toggle {
      background: rgba(30, 30, 50, 0.9);
      border-color: rgba(255, 255, 255, 0.15);
      color: #ccc;
    }
    
    html.ah-dark-mode .page-footer .language-picker:hover,
    html.ah-dark-mode .page-footer .dark-mode-toggle:hover {
      border-color: rgba(255, 255, 255, 0.3);
    }
    
    @media (max-width: 560px) {
      body {
        justify-content: center !important;
        padding: 20px !important;
      }
    }
    
    @media (max-width: 480px) {
      body {
        background: ${widgetBackground} !important;
        padding: 0 !important;
      }
      
      .widget-container {
        max-width: none;
      }
    }
  `;

  return (
    <>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Sign in - {clientName}</title>
      {faviconUrl && <link rel="icon" href={faviconUrl} />}
      {fontUrl && <link rel="stylesheet" href={fontUrl} />}
      <style dangerouslySetInnerHTML={{ __html: styleContent }} />
      <script type="module" src="/u/widget/authhero-widget.esm.js" />
    </>
  );
}

/**
 * Generate the <head> content string for liquid template substitution
 */
function generateHeadContent(options: HeadContentProps): string {
  return (<HeadContent {...options} />).toString();
}

/**
 * Props for widget content
 */
type WidgetContentProps = {
  state: string;
  screenId: string;
  authParams: {
    client_id: string;
    redirect_uri?: string;
    scope?: string;
    audience?: string;
    nonce?: string;
    response_type?: string;
  };
  screenJson: string;
  brandingJson?: string;
  themeJson?: string;
  widgetHtml?: string;
  poweredByLogo?: {
    url: string;
    alt: string;
    href?: string;
    height?: number;
  };
};

/**
 * Widget content component for liquid template substitution
 */
function WidgetContent({
  state,
  screenId,
  authParams,
  screenJson,
  brandingJson,
  themeJson,
  widgetHtml,
  poweredByLogo,
}: WidgetContentProps) {
  // Note: We don't need to call escapeHtml() on these values because
  // Hono's JSX automatically escapes attribute values when calling .toString().
  // Manual escaping would result in double-escaping (e.g., < becomes &amp;lt;)
  const authParamsJson = JSON.stringify(authParams);

  // Sanitize powered-by logo URLs
  const safePoweredByUrl = poweredByLogo?.url
    ? sanitizeUrl(poweredByLogo.url)
    : null;
  const safePoweredByHref = poweredByLogo?.href
    ? sanitizeUrl(poweredByLogo.href)
    : null;

  // Build widget element - either SSR output or empty shell for client-side hydration
  // Wrap in a div with data-screen attribute for CSS targeting since Stencil SSR
  // strips unknown attributes from the widget element
  const widgetElement = widgetHtml ? (
    <div data-screen={screenId} dangerouslySetInnerHTML={{ __html: widgetHtml }} />
  ) : (
    <div data-screen={screenId}>
      <authhero-widget
        id="widget"
        screen={screenJson}
        branding={brandingJson}
        theme={themeJson}
        state={state}
        auth-params={authParamsJson}
        auto-submit="true"
        auto-navigate="true"
      />
    </div>
  );

  return (
    <div class="widget-container">
      {widgetElement}
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
    </div>
  );
}

/**
 * Generate the widget content string for liquid template substitution
 */
function generateWidgetContent(options: WidgetContentProps): string {
  return (<WidgetContent {...options} />).toString();
}

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
 * Props for footer content
 */
type FooterContentProps = {
  language: string;
  availableLanguages?: string[];
};

/**
 * Footer content component for liquid template substitution.
 * Renders a language picker and other page-level footer items.
 */
function FooterContent({
  language,
  availableLanguages,
}: FooterContentProps) {
  const langs = availableLanguages && availableLanguages.length > 1
    ? availableLanguages
    : undefined;

  return (
    <div class="page-footer">
      <button
        class="dark-mode-toggle"
        type="button"
        aria-label="Toggle dark mode"
        onclick={`(function(btn){var h=document.documentElement,isDark=h.classList.toggle('ah-dark-mode');var v={'--ah-color-text':'#f9fafb','--ah-color-text-muted':'#9ca3af','--ah-color-text-label':'#d1d5db','--ah-color-header':'#f9fafb','--ah-color-bg':'#1f2937','--ah-color-bg-muted':'#374151','--ah-color-bg-disabled':'#4b5563','--ah-color-input-bg':'#374151','--ah-color-border':'#4b5563','--ah-color-border-muted':'#374151','--ah-color-error-bg':'rgba(220,38,38,0.2)','--ah-color-success-bg':'rgba(22,163,74,0.2)'};for(var k in v){if(isDark)h.style.setProperty(k,v[k]);else h.style.removeProperty(k)}btn.querySelector('.icon-sun').style.display=isDark?'none':'block';btn.querySelector('.icon-moon').style.display=isDark?'block':'none';try{localStorage.setItem('ah-dark-mode',isDark?'1':'0')}catch(e){}})(this)`}
      >
        <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      {langs && (
        <div class="language-picker">
          <svg class="language-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <select
            class="language-select"
            onchange={`window.location.search=window.location.search.replace(/([?&])ui_locales=[^&]*/,'').replace(/^&/,'?')+(window.location.search?'&':'?')+'ui_locales='+this.value`}
          >
            {langs.map((lang) => (
              <option value={lang} selected={lang === language}>
                {LANGUAGE_NAMES[lang] || lang}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/**
 * Generate the footer content string for liquid template substitution
 */
function generateFooterContent(options: FooterContentProps): string {
  return (<FooterContent {...options} />).toString();
}

/**
 * Apply a Liquid template by replacing auth0:head, auth0:widget, and auth0:footer tags
 */
function applyLiquidTemplate(
  template: string,
  headContent: string,
  widgetContent: string,
  footerContent?: string,
): string {
  let result = template
    .replace("{%- auth0:head -%}", headContent)
    .replace("{%- auth0:widget -%}", widgetContent);
  if (footerContent) {
    result = result.replace("{%- auth0:footer -%}", footerContent);
  }
  return result;
}

/**
 * Create a route handler for a specific screen with SSR + hydration
 */
function createScreenRouteHandler(screenId: string) {
  return async (ctx: any) => {
    const { state, error, error_description, ui_locales } =
      ctx.req.valid("query");

    let theme, branding, client, loginSession;
    try {
      const initResult = await initJSXRoute(ctx, state, true);
      theme = initResult.theme;
      branding = initResult.branding;
      client = initResult.client;
      loginSession = initResult.loginSession;
    } catch (err) {
      console.error(`[u2/${screenId}] Failed to initialize route:`, err);
      throw err;
    }

    // If the user changed language via the picker, persist it to the login session
    // so subsequent screens and emails use the new language
    if (ui_locales && ui_locales !== loginSession.authParams?.ui_locales) {
      await ctx.env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        {
          authParams: {
            ...loginSession.authParams,
            ui_locales,
          },
        },
      );
      loginSession.authParams.ui_locales = ui_locales;
    }

    // Get custom template if available (gracefully handle missing method/table)
    let customTemplate: { body: string } | null = null;
    try {
      customTemplate = await ctx.env.data.universalLoginTemplates.get(
        ctx.var.tenant_id,
      );
    } catch {
      // Method or table may not exist in older adapters - continue without custom template
    }

    // Detect language: URL ui_locales (picker) > session ui_locales (OAuth) > Accept-Language > "en"
    const acceptLanguage = ctx.req.header("Accept-Language");
    const language = detectLanguage(
      ui_locales || loginSession.authParams?.ui_locales,
      acceptLanguage,
    );

    // Fetch custom text for this screen and language
    const promptScreen = getPromptScreenForScreen(screenId);
    const customText = await fetchCustomText(
      ctx,
      ctx.var.tenant_id,
      screenId,
      language,
    );

    // Build error messages if present from query params
    const errorMessages: Array<{
      text: string;
      type: "error" | "info" | "success" | "warning";
    }> = [];
    if (error_description) {
      errorMessages.push({ text: error_description, type: "error" });
    } else if (error) {
      // Fallback to error code if no description provided
      errorMessages.push({ text: error, type: "error" });
    }

    // Build screen context for SSR
    // Use client.connections which is already ordered per the client's configuration
    // Determine route prefix based on client metadata
    const routePrefix =
      client.client_metadata?.universal_login_version === "2" ? "/u2" : "/u";
    const screenContext: ScreenContext = {
      ctx,
      tenant: client.tenant,
      client,
      branding: branding ?? undefined,
      connections: client.connections,
      state,
      prefill: {
        username: loginSession.authParams.username,
        email: loginSession.authParams.username,
      },
      data: {
        email: loginSession.authParams.username,
      },
      customText,
      language,
      promptScreen,
      routePrefix,
      messages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    // Fetch screen data for SSR
    const screenResult = getScreen(screenId, screenContext);

    if (!screenResult) {
      throw new HTTPException(404, {
        message: `Screen not found: ${screenId}`,
      });
    }

    // Handle both sync and async screen factories
    let result;
    try {
      result = await screenResult;
    } catch (err) {
      console.error(`[u2/${screenId}] Screen handler error:`, err);
      console.error(`[u2/${screenId}] Context:`, {
        tenant_id: client.tenant?.id,
        client_id: client.client_id,
        client_name: client.name,
        state,
      });
      throw err;
    }

    // Override action URL to use the screen-api endpoint
    // The screen handlers return /u/widget/:screenId but we want /u2/screen/:screenId
    const screen = {
      ...result.screen,
      action: `/u2/screen/${screenId}?state=${encodeURIComponent(state)}`,
      // Update links to use u2 routes
      links: result.screen.links?.map((link) => ({
        ...link,
        href: link.href
          .replace("/u/widget/", "/u2/")
          .replace("/u2/signup", "/u2/signup")
          .replace("/u/signup", "/u2/signup")
          .replace("/u/enter-", "/u2/enter-"),
      })),
    };

    const authParams = {
      client_id: loginSession.authParams.client_id,
      ...(loginSession.authParams.redirect_uri && {
        redirect_uri: loginSession.authParams.redirect_uri,
      }),
      ...(loginSession.authParams.scope && {
        scope: loginSession.authParams.scope,
      }),
      ...(loginSession.authParams.audience && {
        audience: loginSession.authParams.audience,
      }),
      ...(loginSession.authParams.nonce && {
        nonce: loginSession.authParams.nonce,
      }),
      ...(loginSession.authParams.response_type && {
        response_type: loginSession.authParams.response_type,
      }),
    };

    // Serialize data for widget attributes (using the modified screen with correct action URL)
    const screenJson = JSON.stringify(screen);
    const brandingJson = result.branding
      ? JSON.stringify(result.branding)
      : undefined;
    const authParamsJson = JSON.stringify(authParams);
    const themeJson = theme ? JSON.stringify(theme) : undefined;

    // Attempt SSR for the widget
    const widgetHtml = await renderWidgetSSR({
      screenId,
      screenJson,
      brandingJson,
      themeJson,
      state,
      authParamsJson,
    });

    // If there's a custom template, use liquid template rendering with SSR content
    if (customTemplate) {
      const brandingProps = extractBrandingProps(branding);

      const headContent = generateHeadContent({
        clientName: client.name || "AuthHero",
        branding: brandingProps,
        themePageBackground: theme?.page_background,
        theme,
      });

      const widgetContent = generateWidgetContent({
        state,
        screenId,
        authParams,
        screenJson,
        brandingJson,
        themeJson,
        widgetHtml,
        poweredByLogo: ctx.env.poweredByLogo,
      });

      const footerContent = generateFooterContent({
        language,
        availableLanguages: Object.keys(LANGUAGE_NAMES),
      });

      const renderedHtml = applyLiquidTemplate(
        customTemplate.body,
        headContent,
        widgetContent,
        footerContent,
      );

      return ctx.html(renderedHtml);
    }

    // Default: return SSR widget page directly
    return ctx.html(
      <WidgetPage
        widgetHtml={widgetHtml}
        screenId={screenId}
        branding={extractBrandingProps(branding)}
        theme={theme}
        themePageBackground={theme?.page_background}
        clientName={client.name || "AuthHero"}
        poweredByLogo={ctx.env.poweredByLogo}
        language={language}
        availableLanguages={Object.keys(LANGUAGE_NAMES)}
      />,
    );
  };
}

/**
 * Common query schema for all screen routes
 */
const screenQuerySchema = z.object({
  state: z.string().openapi({
    description: "The login session state",
  }),
  error: z.string().optional().openapi({
    description: "Error code from failed authentication",
  }),
  error_description: z.string().optional().openapi({
    description: "Human-readable error description",
  }),
  ui_locales: z.string().optional().openapi({
    description:
      "Language override from the language picker (e.g. 'en', 'sv')",
  }),
});

/**
 * Create GET route definition
 */
function createScreenRoute(
  _screenId: string,
  path: string,
  description: string,
) {
  return createRoute({
    tags: ["u2"],
    method: "get" as const,
    path,
    request: {
      query: screenQuerySchema,
    },
    responses: {
      200: {
        description,
        content: {
          "text/html": {
            schema: z.string(),
          },
        },
      },
    },
  });
}

/**
 * Create POST route definition for no-JS form submissions
 */
function createScreenPostRoute(
  _screenId: string,
  path: string,
  description: string,
) {
  return createRoute({
    tags: ["u2"],
    method: "post" as const,
    path,
    request: {
      query: screenQuerySchema,
      body: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: z.record(z.string(), z.string()),
          },
        },
      },
    },
    responses: {
      200: {
        description,
        content: {
          "text/html": {
            schema: z.string(),
          },
        },
      },
      302: {
        description: "Redirect to next screen or external URL",
      },
    },
  });
}

/**
 * Create a POST handler for no-JS form submissions
 * Processes form data, calls the screen's POST handler, and returns full HTML page
 */
function createScreenPostHandler(screenId: string) {
  return async (ctx: any) => {
    const { state, ui_locales } = ctx.req.valid("query");

    // Parse form data
    const formData = await ctx.req.parseBody();
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(formData)) {
      data[key] = value;
    }

    const { theme, branding, client, loginSession } = await initJSXRoute(
      ctx,
      state,
      true,
    );

    // If the user changed language via the picker, persist it to the login session
    if (ui_locales && ui_locales !== loginSession.authParams?.ui_locales) {
      await ctx.env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        {
          authParams: {
            ...loginSession.authParams,
            ui_locales,
          },
        },
      );
      loginSession.authParams.ui_locales = ui_locales;
    }

    // Detect language: URL ui_locales (picker) > session ui_locales (OAuth) > Accept-Language > "en"
    const acceptLanguage = ctx.req.header("Accept-Language");
    const language = detectLanguage(
      ui_locales || loginSession.authParams?.ui_locales,
      acceptLanguage,
    );

    // Fetch custom text for this screen and language
    const promptScreen = getPromptScreenForScreen(screenId);
    const customText = await fetchCustomText(
      ctx,
      ctx.var.tenant_id,
      screenId,
      language,
    );

    // Build screen context
    // Use client.connections which is already ordered per the client's configuration
    // Determine route prefix based on client metadata
    const routePrefix =
      client.client_metadata?.universal_login_version === "2" ? "/u2" : "/u";
    const screenContext: ScreenContext = {
      ctx,
      tenant: client.tenant,
      client,
      branding: branding ?? undefined,
      connections: client.connections,
      state,
      prefill: {
        username: loginSession.authParams.username,
        email: loginSession.authParams.username,
      },
      data: {
        email: loginSession.authParams.username,
      },
      customText,
      language,
      promptScreen,
      routePrefix,
    };

    // Get screen definition and call POST handler
    const definition = getScreenDefinition(screenId);
    if (!definition?.handler.post) {
      throw new HTTPException(400, {
        message: `Screen ${screenId} does not support POST submissions`,
      });
    }

    const result = await definition.handler.post(screenContext, data);

    // If redirect to external URL, do actual redirect with cookies
    if ("redirect" in result) {
      const headers = new Headers();
      headers.set("Location", result.redirect);
      // Add Set-Cookie headers if present
      if (result.cookies && result.cookies.length > 0) {
        for (const cookie of result.cookies) {
          headers.append("Set-Cookie", cookie);
        }
      }
      return new Response(null, {
        status: 302,
        headers,
      });
    }

    // If handler returned a direct Response (e.g., web_message mode), pass it through
    if ("response" in result) {
      return result.response;
    }

    // Otherwise, render the next/current screen as full HTML page
    const screenResult = result.screen;

    // Get custom template if available
    let customTemplate: { body: string } | null = null;
    try {
      customTemplate = await ctx.env.data.universalLoginTemplates.get(
        ctx.var.tenant_id,
      );
    } catch {
      // Method or table may not exist
    }

    const authParams = {
      client_id: loginSession.authParams.client_id,
      ...(loginSession.authParams.redirect_uri && {
        redirect_uri: loginSession.authParams.redirect_uri,
      }),
      ...(loginSession.authParams.scope && {
        scope: loginSession.authParams.scope,
      }),
      ...(loginSession.authParams.audience && {
        audience: loginSession.authParams.audience,
      }),
      ...(loginSession.authParams.nonce && {
        nonce: loginSession.authParams.nonce,
      }),
      ...(loginSession.authParams.response_type && {
        response_type: loginSession.authParams.response_type,
      }),
    };

    // Serialize screen data
    const screenJson = JSON.stringify(screenResult.screen);
    const brandingJson = screenResult.branding
      ? JSON.stringify(screenResult.branding)
      : undefined;
    const authParamsJson = JSON.stringify(authParams);
    const themeJson = theme ? JSON.stringify(theme) : undefined;
    // Get screen name for data-screen attribute (falls back to original screenId if not set)
    const resultScreenId = screenResult.screen.name || screenId;

    // Attempt SSR
    const widgetHtml = await renderWidgetSSR({
      screenId: resultScreenId,
      screenJson,
      brandingJson,
      themeJson,
      state,
      authParamsJson,
    });

    // If there's a custom template, use it
    if (customTemplate) {
      const brandingProps = extractBrandingProps(branding);

      const headContent = generateHeadContent({
        clientName: client.name || "AuthHero",
        branding: brandingProps,
        themePageBackground: theme?.page_background,
        theme,
      });

      const widgetContent = generateWidgetContent({
        state,
        screenId: resultScreenId,
        authParams,
        screenJson,
        brandingJson,
        themeJson,
        widgetHtml,
        poweredByLogo: ctx.env.poweredByLogo,
      });

      const renderedHtml = applyLiquidTemplate(
        customTemplate.body,
        headContent,
        widgetContent,
        generateFooterContent({
          language,
          availableLanguages: Object.keys(LANGUAGE_NAMES),
        }),
      );

      return ctx.html(renderedHtml);
    }

    // Default: return SSR widget page
    return ctx.html(
      <WidgetPage
        widgetHtml={widgetHtml}
        screenId={resultScreenId}
        branding={extractBrandingProps(branding)}
        theme={theme}
        themePageBackground={theme?.page_background}
        clientName={client.name || "AuthHero"}
        poweredByLogo={ctx.env.poweredByLogo}
        language={language}
        availableLanguages={Object.keys(LANGUAGE_NAMES)}
      />,
    );
  };
}

export const u2Routes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u2/login - Combined identifier + password screen (identifier + password flow)
  // --------------------------------
  .openapi(
    createScreenRoute(
      "login",
      "/login",
      "Login screen - combined email, password, and social login",
    ),
    createScreenRouteHandler("login"),
  )
  // --------------------------------
  // GET /u2/login/identifier - First screen of login flow
  // --------------------------------
  .openapi(
    createScreenRoute(
      "identifier",
      "/login/identifier",
      "Identifier screen - collects email/username",
    ),
    createScreenRouteHandler("identifier"),
  )
  // --------------------------------
  // GET /u2/enter-code - OTP code verification
  // --------------------------------
  .openapi(
    createScreenRoute(
      "enter-code",
      "/enter-code",
      "Enter code screen - OTP verification",
    ),
    createScreenRouteHandler("enter-code"),
  )
  // --------------------------------
  // GET /u2/enter-password - Password authentication
  // --------------------------------
  .openapi(
    createScreenRoute(
      "enter-password",
      "/enter-password",
      "Enter password screen",
    ),
    createScreenRouteHandler("enter-password"),
  )
  // --------------------------------
  // GET /u2/signup - New user registration
  // --------------------------------
  .openapi(
    createScreenRoute(
      "signup",
      "/signup",
      "Signup screen - new user registration",
    ),
    createScreenRouteHandler("signup"),
  )
  // --------------------------------
  // GET /u2/forgot-password - Password reset request
  // --------------------------------
  .openapi(
    createScreenRoute(
      "forgot-password",
      "/forgot-password",
      "Forgot password screen",
    ),
    createScreenRouteHandler("forgot-password"),
  )
  // --------------------------------
  // GET /u2/reset-password - Set new password
  // --------------------------------
  .openapi(
    createScreenRoute(
      "reset-password",
      "/reset-password",
      "Reset password screen",
    ),
    createScreenRouteHandler("reset-password"),
  )
  // --------------------------------
  // GET /u2/impersonate - User impersonation
  // --------------------------------
  .openapi(
    createScreenRoute(
      "impersonate",
      "/impersonate",
      "Impersonate screen - allows users with permission to impersonate other users",
    ),
    createScreenRouteHandler("impersonate"),
  )
  // --------------------------------
  // POST handlers for no-JS form submissions
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "login",
      "/login",
      "Process login form submission (no-JS fallback)",
    ),
    createScreenPostHandler("login"),
  )
  .openapi(
    createScreenPostRoute(
      "identifier",
      "/login/identifier",
      "Process identifier form submission (no-JS fallback)",
    ),
    createScreenPostHandler("identifier"),
  )
  .openapi(
    createScreenPostRoute(
      "enter-code",
      "/enter-code",
      "Process enter-code form submission (no-JS fallback)",
    ),
    createScreenPostHandler("enter-code"),
  )
  .openapi(
    createScreenPostRoute(
      "enter-password",
      "/enter-password",
      "Process enter-password form submission (no-JS fallback)",
    ),
    createScreenPostHandler("enter-password"),
  )
  .openapi(
    createScreenPostRoute(
      "signup",
      "/signup",
      "Process signup form submission (no-JS fallback)",
    ),
    createScreenPostHandler("signup"),
  )
  .openapi(
    createScreenPostRoute(
      "forgot-password",
      "/forgot-password",
      "Process forgot-password form submission (no-JS fallback)",
    ),
    createScreenPostHandler("forgot-password"),
  )
  .openapi(
    createScreenPostRoute(
      "reset-password",
      "/reset-password",
      "Process reset-password form submission (no-JS fallback)",
    ),
    createScreenPostHandler("reset-password"),
  )
  .openapi(
    createScreenPostRoute(
      "impersonate",
      "/impersonate",
      "Process impersonate form submission (no-JS fallback)",
    ),
    createScreenPostHandler("impersonate"),
  )
  // --------------------------------
  // GET /u2/check-account - Check existing session
  // --------------------------------
  .openapi(
    createScreenRoute(
      "check-account",
      "/check-account",
      "Check account screen - allows users to continue with existing session",
    ),
    createScreenRouteHandler("check-account"),
  )
  // --------------------------------
  // POST /u2/check-account
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "check-account",
      "/check-account",
      "Process check-account form submission (no-JS fallback)",
    ),
    createScreenPostHandler("check-account"),
  );

// OpenAPI documentation
u2Routes.doc("/spec", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "U2 Universal Login (Client-side Widget)",
    description: `Client-side widget-based universal login. Available built-in screens: ${listScreenIds().join(", ")}`,
  },
});
