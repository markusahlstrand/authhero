/**
 * Widget Routes - Universal Login with built-in screens
 *
 * These routes serve the widget UI for each screen in the login flow.
 * The screens are defined in code (./screens/) rather than stored in the database.
 *
 * Route pattern: /u/widget/:screenId?state=...
 *
 * Available screens:
 * - /u/widget/identifier - Email/username input (first screen)
 * - /u/widget/enter-code - OTP code verification
 * - /u/widget/enter-password - Password authentication
 * - /u/widget/signup - New user registration
 * - /u/widget/forgot-password - Password reset request
 * - /u/widget/reset-password - Set new password
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import { getScreen, isValidScreenId, listScreenIds } from "./screens/registry";
import type { ScreenContext } from "./screens/types";
import { HTTPException } from "hono/http-exception";
import {
  escapeHtml,
  escapeJs,
  sanitizeUrl,
  sanitizeCssColor,
  buildPageBackground,
} from "./sanitization-utils";

/**
 * Render the widget page HTML
 */
function renderWidgetPage(options: {
  screen: Record<string, unknown>;
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
  baseUrl: string;
  state: string;
}): string {
  const { screen, branding, clientName, baseUrl, state } = options;

  // Build CSS variables from branding
  const cssVariables: string[] = [];
  const primaryColor = sanitizeCssColor(branding?.colors?.primary);
  if (primaryColor) {
    cssVariables.push(`--ah-color-primary: ${primaryColor}`);
  }

  const pageBackground = buildPageBackground(branding?.colors?.page_background);
  const faviconUrl = sanitizeUrl(branding?.favicon_url);
  const fontUrl = sanitizeUrl(branding?.font?.url);
  const safeClientName = escapeHtml(clientName);

  // Serialize screen for JavaScript (will be hydrated on client)
  const screenJson = JSON.stringify(screen);
  const brandingJson = branding ? JSON.stringify(branding) : "null";

  return `<!DOCTYPE html>
<html lang="en">
<head>
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
  </style>
  <script type="module" src="/u/widget/authhero-widget.esm.js"></script>
</head>
<body>
  <authhero-widget id="widget">
    <div class="loading">Loading...</div>
  </authhero-widget>

  <script type="module">
    const widget = document.getElementById('widget');
    const baseUrl = '${escapeJs(baseUrl)}';
    const state = '${escapeJs(state)}';
    
    // Initial screen data (hydration)
    const initialScreen = ${screenJson};
    const initialBranding = ${brandingJson};
    
    // Set the initial screen
    widget.screen = initialScreen;
    if (initialBranding) {
      widget.branding = initialBranding;
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
        // Redirect to social provider
        const socialUrl = baseUrl + '/authorize?' + new URLSearchParams({
          connection: value,
          state: state,
        }).toString();
        window.location.href = socialUrl;
      }
      
      if (type === 'RESEND_BUTTON') {
        // Trigger resend action
        fetch(widget.screen?.action + '&action=resend', {
          method: 'POST',
          credentials: 'include',
        });
      }
    });
    
    // Handle link clicks
    widget.addEventListener('linkClick', (event) => {
      const { href } = event.detail;
      if (href) {
        window.location.href = href;
      }
    });
  </script>
</body>
</html>`;
}

export const widgetRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/widget/:screenId - Serve widget page with built-in screen
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["widget"],
      method: "get",
      path: "/:screenId",
      request: {
        params: z.object({
          screenId: z.string().openapi({
            description: `Screen ID. Available screens: ${listScreenIds().join(", ")}`,
          }),
        }),
        query: z.object({
          state: z.string().openapi({
            description: "The login session state",
          }),
        }),
      },
      responses: {
        200: {
          description: "Widget page HTML",
          content: {
            "text/html": {
              schema: z.string(),
            },
          },
        },
        404: {
          description: "Screen not found",
        },
      },
    }),
    async (ctx) => {
      const { screenId } = ctx.req.valid("param");
      const { state } = ctx.req.valid("query");

      if (!isValidScreenId(screenId)) {
        throw new HTTPException(404, {
          message: `Screen not found: ${screenId}. Available screens: ${listScreenIds().join(", ")}`,
        });
      }

      const { branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
        true,
      );

      // Get connections for this client
      const connectionsResult = await ctx.env.data.connections.list(
        client.tenant.id,
      );

      const baseUrl = new URL(ctx.req.url).origin;

      // Build screen context
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

      const screenResult = getScreen(screenId, screenContext);

      if (!screenResult) {
        throw new HTTPException(404, {
          message: `Screen not found: ${screenId}`,
        });
      }

      // Handle both sync and async screen factories
      const result = await screenResult;

      const html = renderWidgetPage({
        screen: result.screen as unknown as Record<string, unknown>,
        branding: result.branding,
        clientName: client.name || "AuthHero",
        baseUrl,
        state,
      });

      return ctx.html(html);
    },
  )
  // --------------------------------
  // POST /u/widget/:screenId - Handle form submission
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["widget"],
      method: "post",
      path: "/:screenId",
      request: {
        params: z.object({
          screenId: z.string(),
        }),
        query: z.object({
          state: z.string(),
          action: z.string().optional(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                data: z.record(z.string(), z.any()),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Next screen or redirect",
          content: {
            "application/json": {
              schema: z.union([
                z.object({
                  screen: z.any(),
                  branding: z.any().optional(),
                }),
                z.object({
                  redirect: z.string(),
                }),
              ]),
            },
          },
        },
      },
    }),
    async (ctx) => {
      const { screenId } = ctx.req.valid("param");
      const { state } = ctx.req.valid("query");
      const { data } = ctx.req.valid("json");

      // For now, return a simple response
      // TODO: Implement actual screen handlers that process form data
      // and determine the next screen or redirect

      const { branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
        true,
      );

      const connectionsResult = await ctx.env.data.connections.list(
        client.tenant.id,
      );
      const baseUrl = new URL(ctx.req.url).origin;

      // Placeholder: determine next screen based on current screen and data
      let nextScreenId: string | undefined;
      let errors: Record<string, string> | undefined;

      switch (screenId) {
        case "identifier":
          // Check if user exists and has password
          // For now, go to enter-password
          if (data.username) {
            nextScreenId = "enter-password";
          } else {
            errors = { username: "Email is required" };
          }
          break;

        case "enter-password":
          // Validate password
          // For now, show error
          errors = { password: "Invalid password" };
          break;

        case "enter-code":
          // Validate code
          errors = { code: "Invalid code" };
          break;

        case "signup":
          // Validate signup
          if (!data.email) {
            errors = { email: "Email is required" };
          } else if (!data.password) {
            errors = { password: "Password is required" };
          }
          break;

        case "forgot-password":
          // Send reset email and show success
          nextScreenId = "forgot-password";
          break;

        default:
          break;
      }

      // Build context for next screen
      const screenContext: ScreenContext = {
        ctx,
        tenant: client.tenant,
        client,
        branding: branding ?? undefined,
        connections: connectionsResult.connections,
        state,
        baseUrl,
        prefill: {
          username:
            (data.username as string) || loginSession.authParams.username,
          email: (data.email as string) || (data.username as string),
        },
        errors,
        data: {
          email: (data.email as string) || (data.username as string),
        },
      };

      const targetScreenId = errors ? screenId : nextScreenId || screenId;
      const screenResult = getScreen(targetScreenId, screenContext);

      if (!screenResult) {
        return ctx.json({ redirect: `${baseUrl}/callback?state=${state}` });
      }

      // Handle both sync and async screen factories
      const result = await screenResult;

      return ctx.json({
        screen: result.screen,
        branding: result.branding,
      });
    },
  );
