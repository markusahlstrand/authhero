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
import { getScreen, listScreenIds } from "./screens/registry";
import type { ScreenContext } from "./screens/types";
import { HTTPException } from "hono/http-exception";
import { renderToString } from "@authhero/widget/hydrate";
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
  widgetHtml: string;
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
  poweredByLogo?: {
    url: string;
    alt: string;
    href?: string;
    height?: number;
  };
};

/**
 * Widget page component - renders the HTML page with SSR widget
 */
function WidgetPage({
  widgetHtml,
  branding,
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
            `,
          }}
        />
        <script type="module" src="/u/widget/authhero-widget.esm.js" />
      </head>
      <body style={bodyStyle}>
        {/* SSR widget - rendered server-side, hydrated on client */}
        <div
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
      justify-content: ${justifyContent};
      background: ${pageBackground};
      font-family: ${fontUrl ? "'Inter', system-ui, sans-serif" : "system-ui, -apple-system, sans-serif"};
      padding: ${padding};
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
 * Includes screen data for SSR
 */
function generateWidgetContent(options: {
  state: string;
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
  poweredByLogo?: {
    url: string;
    alt: string;
    href?: string;
    height?: number;
  };
}): string {
  const { state, authParams, screenJson, brandingJson, poweredByLogo } = options;

  const safeState = escapeHtml(state);
  const safeAuthParams = escapeHtml(JSON.stringify(authParams));
  const safeScreenJson = escapeHtml(screenJson);
  const safeBrandingJson = brandingJson ? escapeHtml(brandingJson) : undefined;

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
      screen="${safeScreenJson}"
      ${safeBrandingJson ? `branding="${safeBrandingJson}"` : ""}
      state="${safeState}"
      auth-params="${safeAuthParams}"
      auto-submit="true"
      auto-navigate="true"
    ></authhero-widget>${poweredByHtml}`;
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
 * Create a route handler for a specific screen with SSR + hydration
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

    // Get connections for this client
    const connectionsResult = await ctx.env.data.connections.list(
      client.tenant.id,
    );

    const baseUrl = new URL(ctx.req.url).origin;

    // Build screen context for SSR
    const screenContext: ScreenContext = {
      ctx,
      tenant: client.tenant,
      client,
      branding: branding ?? undefined,
      connections: connectionsResult.connections,
      state,
      baseUrl,
      prefill: {
        username: loginSession.authParams.username,
        email: loginSession.authParams.username,
      },
      data: {
        email: loginSession.authParams.username,
      },
    };

    // Fetch screen data for SSR
    const screenResult = getScreen(screenId, screenContext);

    if (!screenResult) {
      throw new HTTPException(404, {
        message: `Screen not found: ${screenId}`,
      });
    }

    // Handle both sync and async screen factories
    const result = await screenResult;

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

    // Serialize data for widget attributes
    const screenJson = JSON.stringify(result.screen);
    const brandingJson = result.branding
      ? JSON.stringify(result.branding)
      : undefined;
    const authParamsJson = JSON.stringify(authParams);

    // If there's a custom template, use liquid template rendering (no SSR for custom templates)
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
        state,
        authParams,
        screenJson,
        brandingJson,
        poweredByLogo: ctx.env.poweredByLogo,
      });

      const renderedHtml = applyLiquidTemplate(
        customTemplate.body,
        headContent,
        widgetContent,
      );

      return ctx.html(renderedHtml);
    }

    // Default: use SSR with renderToString
    const widgetHtmlResult = await renderToString(
      `<authhero-widget
        id="widget"
        screen='${screenJson.replace(/'/g, "&#39;")}'
        ${brandingJson ? `branding='${brandingJson.replace(/'/g, "&#39;")}'` : ""}
        state="${state}"
        auth-params='${authParamsJson.replace(/'/g, "&#39;")}'
        auto-submit="true"
        auto-navigate="true"
      ></authhero-widget>`,
      {
        fullDocument: false,
        serializeShadowRoot: "declarative-shadow-dom",
      },
    );

    return ctx.html(
      <WidgetPage
        widgetHtml={widgetHtmlResult.html || ""}
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
