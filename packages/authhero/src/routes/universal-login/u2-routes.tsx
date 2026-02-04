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

/**
 * Widget page component - renders the HTML page with SSR widget
 */
function WidgetPage({
  widgetHtml,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme?: any;
}): string {
  const { clientName, branding, themePageBackground, theme } = options;

  const faviconUrl = sanitizeUrl(branding?.favicon_url);
  const fontUrl = sanitizeUrl(branding?.font?.url);
  const safeClientName = escapeHtml(clientName);
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
  themeJson?: string;
  widgetHtml?: string;
  poweredByLogo?: {
    url: string;
    alt: string;
    href?: string;
    height?: number;
  };
}): string {
  const {
    state,
    authParams,
    screenJson,
    brandingJson,
    themeJson,
    widgetHtml,
    poweredByLogo,
  } = options;

  const safeState = escapeHtml(state);
  const safeAuthParams = escapeHtml(JSON.stringify(authParams));
  const safeScreenJson = escapeHtml(screenJson);
  const safeBrandingJson = brandingJson ? escapeHtml(brandingJson) : undefined;
  const safeThemeJson = themeJson ? escapeHtml(themeJson) : undefined;

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

  // If widgetHtml is provided (SSR output), it already contains the full <authhero-widget> element
  // with all attributes and rendered content, so use it directly. Otherwise, create an empty shell.
  const widgetElement = widgetHtml
    ? widgetHtml
    : `<authhero-widget
      id="widget"
      screen="${safeScreenJson}"
      ${safeBrandingJson ? `branding="${safeBrandingJson}"` : ""}
      ${safeThemeJson ? `theme="${safeThemeJson}"` : ""}
      state="${safeState}"
      auth-params="${safeAuthParams}"
      auto-submit="true"
      auto-navigate="true"
    ></authhero-widget>`;

  return `<div class="widget-container">
    ${widgetElement}${poweredByHtml}
  </div>`;
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

    const baseUrl = new URL(ctx.req.url).origin;

    // Build screen context for SSR
    // Use client.connections which is already ordered per the client's configuration
    const screenContext: ScreenContext = {
      ctx,
      tenant: client.tenant,
      client,
      branding: branding ?? undefined,
      connections: client.connections,
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

    // Override action URL to use the screen-api endpoint
    // The screen handlers return /u/widget/:screenId but we want /u2/screen/:screenId
    const screen = {
      ...result.screen,
      action: `${baseUrl}/u2/screen/${screenId}?state=${encodeURIComponent(state)}`,
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

    // Attempt SSR for the widget (may not work on all platforms like Cloudflare Workers)
    let widgetHtml = "";
    try {
      // Essential for some internal Stencil checks in edge runtimes
      if (typeof (globalThis as any).window === "undefined") {
        (globalThis as any).window = globalThis;
      }

      // Dynamic import to handle environments where hydrate module may not work
      const { renderToString } = await import("@authhero/widget/hydrate");
      const widgetHtmlResult = await renderToString(
        `<authhero-widget
          id="widget"
          screen='${screenJson.replace(/'/g, "&#39;")}'
          ${brandingJson ? `branding='${brandingJson.replace(/'/g, "&#39;")}'` : ""}
          ${themeJson ? `theme='${themeJson.replace(/'/g, "&#39;")}'` : ""}
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
      widgetHtml = widgetHtmlResult.html || "";
    } catch (error) {
      // SSR not available - log the error for debugging
      console.error("SSR failed:", error);
      // Fall back to client-side rendering
    }

    // If there's a custom template, use liquid template rendering with SSR content
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
        theme,
      });

      const widgetContent = generateWidgetContent({
        state,
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
      );

      return ctx.html(renderedHtml);
    }

    // Default: return SSR widget page directly
    return ctx.html(
      <WidgetPage
        widgetHtml={widgetHtml}
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
        theme={theme}
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
    const { state } = ctx.req.valid("query");

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

    const baseUrl = new URL(ctx.req.url).origin;

    // Build screen context
    // Use client.connections which is already ordered per the client's configuration
    const screenContext: ScreenContext = {
      ctx,
      tenant: client.tenant,
      client,
      branding: branding ?? undefined,
      connections: client.connections,
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

    // Get screen definition and call POST handler
    const definition = getScreenDefinition(screenId);
    if (!definition?.handler.post) {
      throw new HTTPException(400, {
        message: `Screen ${screenId} does not support POST submissions`,
      });
    }

    const result = await definition.handler.post(screenContext, data);

    // If redirect to external URL, do actual redirect
    if ("redirect" in result) {
      return ctx.redirect(result.redirect, 302);
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

    // Attempt SSR
    let widgetHtml = "";
    try {
      if (typeof (globalThis as any).window === "undefined") {
        (globalThis as any).window = globalThis;
      }
      const { renderToString } = await import("@authhero/widget/hydrate");
      const widgetHtmlResult = await renderToString(
        `<authhero-widget
          id="widget"
          screen='${screenJson.replace(/'/g, "&#39;")}'
          ${brandingJson ? `branding='${brandingJson.replace(/'/g, "&#39;")}'` : ""}
          ${themeJson ? `theme='${themeJson.replace(/'/g, "&#39;")}'` : ""}
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
      widgetHtml = widgetHtmlResult.html || "";
    } catch (error) {
      console.error("SSR failed:", error);
    }

    // If there's a custom template, use it
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
        theme,
      });

      const widgetContent = generateWidgetContent({
        state,
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
      );

      return ctx.html(renderedHtml);
    }

    // Default: return SSR widget page
    return ctx.html(
      <WidgetPage
        widgetHtml={widgetHtml}
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
        theme={theme}
        themePageBackground={theme?.page_background}
        clientName={client.name || "AuthHero"}
        poweredByLogo={ctx.env.poweredByLogo}
      />,
    );
  };
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
  )
  // --------------------------------
  // POST handlers for no-JS form submissions
  // --------------------------------
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
