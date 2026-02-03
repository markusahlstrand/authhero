/**
 * U2 Routes - Client-side widget universal login
 *
 * These routes serve HTML pages that load the authhero-widget and fetch
 * screen configurations from the /u2/screen API.
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
 * Each route serves an HTML page that:
 * 1. Loads the authhero-widget web component
 * 2. Fetches screen configuration from /u2/screen/:screenId
 * 3. Handles form submissions via the widget
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import { listScreenIds } from "./screens/registry";
import {
  sanitizeUrl,
  sanitizeCssColor,
  buildThemePageBackground,
  escapeHtml,
} from "./sanitization-utils";

/**
 * Props for the WidgetPage component
 */
type WidgetPageProps = {
  screenId: string;
  state: string;
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
  clientName: string;
  authParams: {
    client_id: string;
    redirect_uri?: string;
    scope?: string;
    audience?: string;
    nonce?: string;
    response_type?: string;
  };
  poweredByLogo?: {
    url: string;
    alt: string;
    href?: string;
    height?: number;
  };
};

/**
 * Widget page component - renders the HTML page for the universal login widget
 */
function WidgetPage({
  screenId,
  state,
  branding,
  themePageBackground,
  clientName,
  authParams,
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

  // Sanitize powered-by logo URLs
  const safePoweredByUrl = poweredByLogo?.url
    ? sanitizeUrl(poweredByLogo.url)
    : null;
  const safePoweredByHref = poweredByLogo?.href
    ? sanitizeUrl(poweredByLogo.href)
    : null;

  const bodyStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: pageBackground,
    fontFamily: fontUrl
      ? "'Inter', system-ui, sans-serif"
      : "system-ui, -apple-system, sans-serif",
    padding: "20px",
  };

  const widgetStyle =
    cssVariables.length > 0
      ? cssVariables.join("; ") + "; max-width: 400px; width: 100%;"
      : "max-width: 400px; width: 100%;";

  // Serialize authParams for the widget attribute
  const authParamsJson = JSON.stringify(authParams);

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
              .loading { text-align: center; padding: 40px; color: #666; }
              .error { background: #fee2e2; border: 1px solid #ef4444; color: #dc2626; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
              .powered-by { position: fixed; bottom: 16px; left: 16px; opacity: 0.7; transition: opacity 0.2s; }
              .powered-by:hover { opacity: 1; }
              .powered-by img { display: block; }
            `,
          }}
        />
        <script type="module" src="/u/widget/authhero-widget.esm.js" />
      </head>
      <body style={bodyStyle}>
        <authhero-widget
          id="widget"
          style={widgetStyle}
          api-url={`/u2/screen/${screenId}`}
          screen-id={screenId}
          state={state}
          auth-params={authParamsJson}
          auto-submit={true}
          auto-navigate={true}
        >
          <div class="loading">Loading...</div>
        </authhero-widget>
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

/**
 * Generate the <head> content string for liquid template substitution
 */
function generateHeadContent(options: {
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
}): string {
  const { clientName, branding, themePageBackground } = options;

  const faviconUrl = sanitizeUrl(branding?.favicon_url);
  const fontUrl = sanitizeUrl(branding?.font?.url);
  const safeClientName = escapeHtml(clientName);
  const primaryColor = sanitizeCssColor(branding?.colors?.primary);
  const pageBackground = buildThemePageBackground(
    themePageBackground,
    branding?.colors?.page_background,
  );

  // Build CSS variables from branding
  const cssVariables: string[] = [];
  if (primaryColor) {
    cssVariables.push(`--ah-color-primary: ${primaryColor}`);
  }

  return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in - ${safeClientName}</title>
  ${faviconUrl ? `<link rel="icon" href="${faviconUrl}">` : ""}
  ${fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : ""}
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${pageBackground};
      font-family: ${fontUrl ? "'Inter', system-ui, sans-serif" : "system-ui, -apple-system, sans-serif"};
      padding: 20px;
    }
    
    authhero-widget {
      ${cssVariables.join(";\n      ")};
      max-width: 400px;
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
      position: fixed;
      bottom: 16px;
      left: 16px;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    
    .powered-by:hover {
      opacity: 1;
    }
    
    .powered-by img {
      display: block;
    }
  </style>
  <script type="module" src="/u/widget/authhero-widget.esm.js"></script>`;
}

/**
 * Generate the widget content string for liquid template substitution
 */
function generateWidgetContent(options: {
  screenId: string;
  state: string;
  authParams: {
    client_id: string;
    redirect_uri?: string;
    scope?: string;
    audience?: string;
    nonce?: string;
    response_type?: string;
  };
  poweredByLogo?: {
    url: string;
    alt: string;
    href?: string;
    height?: number;
  };
}): string {
  const { screenId, state, authParams, poweredByLogo } = options;

  const safeScreenId = escapeHtml(screenId);
  const safeState = escapeHtml(state);
  const safeAuthParams = escapeHtml(JSON.stringify(authParams));

  // Build powered-by logo HTML if provided
  let poweredByHtml = "";
  if (poweredByLogo?.url) {
    const safePoweredByUrl = sanitizeUrl(poweredByLogo.url);
    const safePoweredByHref = poweredByLogo.href
      ? sanitizeUrl(poweredByLogo.href)
      : null;
    const safeAlt = escapeHtml(poweredByLogo.alt || "");
    const height = poweredByLogo.height || 20;

    if (safePoweredByUrl) {
      if (safePoweredByHref) {
        poweredByHtml = `
    <div class="powered-by">
      <a href="${safePoweredByHref}" target="_blank" rel="noopener noreferrer">
        <img src="${safePoweredByUrl}" alt="${safeAlt}" height="${height}">
      </a>
    </div>`;
      } else {
        poweredByHtml = `
    <div class="powered-by">
      <img src="${safePoweredByUrl}" alt="${safeAlt}" height="${height}">
    </div>`;
      }
    }
  }

  return `<authhero-widget
      id="widget"
      api-url="/u2/screen/${safeScreenId}"
      screen-id="${safeScreenId}"
      state="${safeState}"
      auth-params="${safeAuthParams}"
      auto-submit="true"
      auto-navigate="true"
    >
      <div class="loading">Loading...</div>
    </authhero-widget>${poweredByHtml}`;
}

/**
 * Apply a Liquid template by replacing auth0:head and auth0:widget tags
 */
function applyLiquidTemplate(
  template: string,
  headContent: string,
  widgetContent: string,
): string {
  return template
    .replace("{%- auth0:head -%}", headContent)
    .replace("{%- auth0:widget -%}", widgetContent);
}

/**
 * Create a route handler for a specific screen
 */
function createScreenRouteHandler(screenId: string) {
  return async (ctx: any) => {
    const { state } = ctx.req.valid("query");
    const { theme, branding, client, loginSession } = await initJSXRoute(
      ctx,
      state,
      true,
    );

    // Get custom template if available (gracefully handle missing method/table)
    let customTemplate: { body: string } | null = null;
    try {
      customTemplate = await ctx.env.data.universalLoginTemplates.get(
        ctx.var.tenant_id,
      );
    } catch {
      // Method or table may not exist in older adapters - continue without custom template
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

    // If there's a custom template, use liquid template rendering
    if (customTemplate) {
      const brandingProps = branding
        ? {
            colors: branding.colors,
            logo_url: branding.logo_url,
            favicon_url: branding.favicon_url,
            font: branding.font,
          }
        : undefined;

      const headContent = generateHeadContent({
        clientName: client.name || "AuthHero",
        branding: brandingProps,
        themePageBackground: theme?.page_background,
      });

      const widgetContent = generateWidgetContent({
        screenId,
        state,
        authParams,
        poweredByLogo: ctx.env.poweredByLogo,
      });

      const renderedHtml = applyLiquidTemplate(
        customTemplate.body,
        headContent,
        widgetContent,
      );

      return ctx.html(renderedHtml);
    }

    // Default: use JSX rendering
    return ctx.html(
      <WidgetPage
        screenId={screenId}
        state={state}
        branding={
          branding
            ? {
                colors: branding.colors,
                logo_url: branding.logo_url,
                favicon_url: branding.favicon_url,
                font: branding.font,
              }
            : undefined
        }
        themePageBackground={theme?.page_background}
        clientName={client.name || "AuthHero"}
        authParams={authParams}
        poweredByLogo={ctx.env.poweredByLogo}
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
});

/**
 * Create route definition
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

export const u2Routes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
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
