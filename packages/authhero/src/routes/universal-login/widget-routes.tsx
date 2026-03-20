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
 * - /u/widget/email-otp-challenge - Email OTP code verification
 * - /u/widget/sms-otp-challenge - SMS OTP code verification
 * - /u/widget/enter-password - Password authentication
 * - /u/widget/signup - New user registration
 * - /u/widget/forgot-password - Password reset request
 * - /u/widget/reset-password - Set new password
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import { renderWidgetPageResponse } from "./u2-widget-page";
import type { DarkModePreference } from "./u2-widget-page";
import {
  getScreen,
  getScreenDefinition,
  isValidScreenId,
  listScreenIds,
} from "./screens/registry";
import type { ScreenContext } from "./screens/types";
import { HTTPException } from "hono/http-exception";
import { sanitizeUrl } from "./sanitization-utils";
import { getCookie } from "hono/cookie";

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
        routePrefix,
      };

      const screenResult = getScreen(screenId, screenContext);

      if (!screenResult) {
        throw new HTTPException(404, {
          message: `Screen not found: ${screenId}`,
        });
      }

      // Handle both sync and async screen factories
      const result = await screenResult;

      const resultScreenId = result.screen.name || screenId;
      const screenJson = JSON.stringify(result.screen);
      const brandingJson = result.branding
        ? JSON.stringify(result.branding)
        : undefined;
      const themeJson = theme ? JSON.stringify(theme) : undefined;
      const authParamsJson = JSON.stringify({
        client_id: loginSession.authParams.client_id,
        redirect_uri: loginSession.authParams.redirect_uri,
        scope: loginSession.authParams.scope,
        audience: loginSession.authParams.audience,
        nonce: loginSession.authParams.nonce,
        response_type: loginSession.authParams.response_type,
      });

      const darkModeCookie = getCookie(ctx, "ah-dark-mode");
      const darkMode: DarkModePreference =
        darkModeCookie === "dark" || darkModeCookie === "light"
          ? darkModeCookie
          : "auto";

      return renderWidgetPageResponse(ctx, {
        screenId: resultScreenId,
        screenJson,
        brandingJson,
        themeJson,
        state,
        authParamsJson,
        branding,
        theme,
        clientName: client.name || "AuthHero",
        poweredByLogo: ctx.env.poweredByLogo,
        language: loginSession.authParams?.ui_locales?.split(" ")[0],
        termsAndConditionsUrl: sanitizeUrl(
          client.client_metadata?.termsAndConditionsUrl,
        ),
        darkMode,
      });
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

      const { branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
        true,
      );

      // Determine route prefix based on client metadata
      const routePrefix =
        client.client_metadata?.universal_login_version === "2" ? "/u2" : "/u";

      // Build screen context
      const screenContext: ScreenContext = {
        ctx,
        tenant: client.tenant,
        client,
        branding: branding ?? undefined,
        connections: client.connections,
        state,
        prefill: {
          username:
            (data.username as string) || loginSession.authParams.username,
          email: (data.email as string) || (data.username as string),
        },
        data: {
          email: (data.email as string) || (data.username as string),
        },
        routePrefix,
      };

      // Check if the screen definition has a custom post handler
      const screenDefinition = getScreenDefinition(screenId);
      if (screenDefinition?.handler.post) {
        const postResult = await screenDefinition.handler.post(
          screenContext,
          data,
        );

        if ("redirect" in postResult) {
          const headers = new Headers();
          // Forward any cookies from the handler as Set-Cookie headers
          if (postResult.cookies && postResult.cookies.length > 0) {
            for (const cookie of postResult.cookies) {
              headers.append("set-cookie", cookie);
            }
          }
          return ctx.json({ redirect: postResult.redirect }, { headers });
        }

        // If handler returned a direct Response (e.g., web_message mode), extract cookies and indicate success
        // This case typically happens for silent auth/web_message mode where the response is an HTML page
        if ("response" in postResult) {
          const headers = new Headers();
          const cookies = postResult.response.headers.getSetCookie?.() || [];
          for (const cookie of cookies) {
            headers.append("set-cookie", cookie);
          }
          // Return the redirect_uri from the auth params so the widget can redirect
          const redirectUri = loginSession.authParams.redirect_uri;
          if (redirectUri) {
            return ctx.json({ redirect: redirectUri }, { headers });
          }
          // No redirect_uri is a configuration error - this shouldn't happen in normal flows
          throw new HTTPException(400, {
            message: "Missing redirect_uri in authentication parameters",
          });
        }

        if ("error" in postResult) {
          return ctx.json({
            screen: postResult.screen.screen,
            branding: postResult.screen.branding,
          });
        }

        return ctx.json({
          screen: postResult.screen.screen,
          branding: postResult.screen.branding,
        });
      }

      // Fallback: use switch statement for screens without custom post handlers
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

        case "email-otp-challenge":
        case "sms-otp-challenge":
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

      // Update context with errors if any
      if (errors) {
        screenContext.errors = errors;
      }

      const targetScreenId = errors ? screenId : nextScreenId || screenId;
      const screenResult = getScreen(targetScreenId, screenContext);

      if (!screenResult) {
        return ctx.json({
          redirect: `/callback?state=${encodeURIComponent(state)}`,
        });
      }

      // Handle both sync and async screen factories
      const result = await screenResult;

      return ctx.json({
        screen: result.screen,
        branding: result.branding,
      });
    },
  );
