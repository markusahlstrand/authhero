import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import CheckEmailPage from "../../components/CheckEmailPage";
import { getAuthCookie } from "../../utils/cookies";
import { createFrontChannelAuthResponse } from "../../authentication-flows/common";
import MessagePage from "../../components/MessagePage";
import i18next from "i18next";
import { HTTPException } from "hono/http-exception";

export const checkAccountRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/check-account
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
      },
      responses: {
        200: {
          description: "HTML page to check account status or verify email.",
          content: { "text/html": { schema: z.string() } },
        },
        302: {
          description: "Redirect to login identifier page if no valid session.",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description:
            "Bad Request - HTML error page if state is missing or other input error.",
          content: { "text/html": { schema: z.string() } },
        },
        500: {
          description: "Internal Server Error - HTML error page.",
          content: { "text/html": { schema: z.string() } },
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { state } = ctx.req.valid("query");

      // Get theme and branding from initJSXRoute
      const { theme, branding, client } = await initJSXRoute(ctx, state);

      if (!client || !client.tenant?.id) {
        console.error(
          "Client or tenant ID missing in GET /u/check-account after initJSXRoute",
        );
        return ctx.html(
          <MessagePage
            theme={theme}
            branding={branding}
            client={client}
            state={state}
            pageTitle={i18next.t("error_page_title") || "Error"}
            message={
              i18next.t("configuration_error_message") ||
              "A configuration error occurred."
            }
          />,
          500,
        );
      }

      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );

      const authSession = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : null;

      // Detect route prefix from request URL (u or u2)
      const routePrefix = new URL(ctx.req.url).pathname.startsWith("/u2/") ? "/u2" : "/u";

      // Check if session exists and is not revoked
      if (!authSession || authSession.revoked_at) {
        return ctx.redirect(`${routePrefix}/login/identifier?state=${state}`);
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(`${routePrefix}/login/identifier?state=${state}`);
      }

      return ctx.html(
        <CheckEmailPage
          theme={theme}
          branding={branding}
          client={client}
          state={state}
          user={user}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/check-account
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "post",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
      },
      responses: {
        302: {
          description:
            "Redirect to continue authentication flow or to login identifier.",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description:
            "Bad Request - HTML error page if state is missing or other input error.",
          content: { "text/html": { schema: z.string() } },
        },
        500: {
          description:
            "Internal Server Error - HTML error page for unexpected issues or if TokenResponse is returned.",
          content: { "text/html": { schema: z.string() } },
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { state } = ctx.req.valid("query");

      const { theme, branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

      if (!client || !client.tenant?.id) {
        console.error(
          "Client or tenant ID missing in POST /u/check-account after initJSXRoute",
        );
        return ctx.html(
          <MessagePage
            theme={theme}
            branding={branding}
            client={client}
            state={state}
            pageTitle={i18next.t("error_page_title") || "Error"}
            message={i18next.t("configuration_error_message")}
          />,
          500,
        );
      }

      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );
      const authSession = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : null;

      // Detect route prefix from request URL (u or u2)
      const routePrefix = new URL(ctx.req.url).pathname.startsWith("/u2/") ? "/u2" : "/u";

      // Check if session exists and is not revoked
      if (!authSession || authSession.revoked_at) {
        return ctx.redirect(`${routePrefix}/login/identifier?state=${state}`);
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(`${routePrefix}/login/identifier?state=${state}`);
      }

      // Let createFrontChannelAuthResponse handle session linking and state transitions
      // It will authenticate the login session with the existing session
      const authResult = await createFrontChannelAuthResponse(ctx, {
        user,
        authParams: loginSession.authParams,
        client,
        loginSession,
        existingSessionIdToLink: authSession.id,
      });

      if (!(authResult instanceof Response)) {
        throw new HTTPException(500, {
          message: i18next.t("unexpected_error_try_again"),
        });
      }
      return authResult;
    },
  );
