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
  buildPageBackground,
  safeJsonStringify,
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
 * Client-side script for the widget page
 */
function getWidgetScript(
  screenId: string,
  state: string,
  authParams: WidgetPageProps["authParams"],
): string {
  return `
    const widget = document.getElementById('widget');
    const screenId = ${JSON.stringify(screenId)};
    const state = ${JSON.stringify(state)};
    const authParams = ${safeJsonStringify(authParams)};

    // Current screen ID for navigation
    let currentScreenId = screenId;

    // Fetch screen configuration from the API using a relative path
    async function fetchScreen(id, nodeId) {
      try {
        let url = '/u2/screen/' + encodeURIComponent(id) + '?state=' + encodeURIComponent(state);
        if (nodeId) {
          url += '&nodeId=' + encodeURIComponent(nodeId);
        }
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
          },
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Failed to load screen' }));
          throw new Error(error.message || 'Failed to load screen');
        }
        
        const data = await response.json();
        
        if (data.screen) {
          widget.screen = data.screen;
          currentScreenId = id;
          
          if (data.branding) {
            widget.branding = data.branding;
          }
        }
      } catch (error) {
        console.error('Error fetching screen:', error);
        widget.innerHTML = '<div class="error">' + escapeHtml(error.message) + '</div>';
      }
    }
    
    // Escape HTML for safe display
    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
    
    // Handle form submissions
    widget.addEventListener('formSubmit', async (event) => {
      const { screen, data } = event.detail;
      
      widget.loading = true;
      
      try {
        const response = await fetch(screen.action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ data }),
        });
        
        const result = await response.json();
        
        if (result.redirect) {
          window.location.href = result.redirect;
          return;
        }
        
        if (result.screen) {
          widget.screen = result.screen;
          if (result.branding) {
            widget.branding = result.branding;
          }
        }
        
        if (result.complete) {
          widget.innerHTML = '<div class="loading">Authentication complete. Redirecting...</div>';
        }
      } catch (error) {
        console.error('Form submission error:', error);
        widget.innerHTML = '<div class="error">Something went wrong. Please try again.</div>';
      } finally {
        widget.loading = false;
      }
    });
    
    // Handle button clicks (social login, etc.)
    widget.addEventListener('buttonClick', (event) => {
      const { id, type, value } = event.detail;
      
      if (type === 'SOCIAL' && value) {
        // Redirect to social provider with all required auth params using relative path
        const params = {
          connection: value,
          state: state,
          client_id: authParams.client_id,
        };
        // Add optional params if present
        if (authParams.redirect_uri) params.redirect_uri = authParams.redirect_uri;
        if (authParams.scope) params.scope = authParams.scope;
        if (authParams.audience) params.audience = authParams.audience;
        if (authParams.nonce) params.nonce = authParams.nonce;
        if (authParams.response_type) params.response_type = authParams.response_type;
        
        const socialUrl = '/authorize?' + new URLSearchParams(params).toString();
        window.location.href = socialUrl;
      }
      
      if (type === 'RESEND_BUTTON') {
        // Trigger resend action via the screen action URL
        const screen = widget.screen;
        if (screen?.action) {
          fetch(screen.action + '&action=resend', {
            method: 'POST',
            credentials: 'include',
          });
        }
      }
    });
    
    // Handle link clicks
    widget.addEventListener('linkClick', (event) => {
      const { href } = event.detail;
      if (href) {
        window.location.href = href;
      }
    });
    
    // Initial load
    fetchScreen(screenId);
  `;
}

/**
 * Widget page component - renders the HTML page for the universal login widget
 */
function WidgetPage({
  screenId,
  state,
  branding,
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

  const pageBackground = buildPageBackground(branding?.colors?.page_background);
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

  const widgetStyle = cssVariables.length > 0 
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
        <authhero-widget id="widget" style={widgetStyle}>
          <div class="loading">Loading...</div>
        </authhero-widget>
        <script
          type="module"
          dangerouslySetInnerHTML={{
            __html: getWidgetScript(screenId, state, authParams),
          }}
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
 * Create a route handler for a specific screen
 */
function createScreenRouteHandler(screenId: string) {
  return async (ctx: any) => {
    const { state } = ctx.req.valid("query");
    const { branding, client, loginSession } = await initJSXRoute(
      ctx,
      state,
      true,
    );

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
        clientName={client.name || "AuthHero"}
        authParams={{
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
        }}
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
