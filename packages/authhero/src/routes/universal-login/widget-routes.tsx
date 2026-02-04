/**
 * Widget Routes - Universal Login with built-in screens (SSR + Hydration)
 *
 * These routes serve the widget UI for each screen in the login flow.
 * The widget is server-side rendered for instant display, then hydrated
 * on the client for interactivity.
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
  sanitizeUrl,
  sanitizeCssColor,
  buildThemePageBackground,
} from "./sanitization-utils";
import { renderToString } from "@authhero/widget/hydrate";

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

      const screenResult = getScreen(screenId, screenContext);

      if (!screenResult) {
        throw new HTTPException(404, {
          message: `Screen not found: ${screenId}`,
        });
      }

      // Handle both sync and async screen factories
      const result = await screenResult;

      // Serialize data for widget attributes
      const screenJson = JSON.stringify(result.screen);
      const brandingJson = result.branding
        ? JSON.stringify(result.branding)
        : undefined;
      const authParamsJson = JSON.stringify({
        client_id: loginSession.authParams.client_id,
        redirect_uri: loginSession.authParams.redirect_uri,
        scope: loginSession.authParams.scope,
        audience: loginSession.authParams.audience,
        nonce: loginSession.authParams.nonce,
        response_type: loginSession.authParams.response_type,
      });

      // Server-side render the widget
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
          branding={result.branding}
          themePageBackground={theme?.page_background}
          clientName={client.name || "AuthHero"}
          poweredByLogo={ctx.env.poweredByLogo}
        />,
      );
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
          } else if (!data.re_password) {
            errors = { re_password: "Please confirm your password" };
          } else if (data.password !== data.re_password) {
            errors = { re_password: "Passwords do not match" };
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
