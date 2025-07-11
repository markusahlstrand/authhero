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

      // Assuming initJSXRoute provides client through vendorSettings or directly if needed
      const { vendorSettings, client } = await initJSXRoute(ctx, state);

      if (!client || !client.tenant?.id) {
        console.error(
          "Client or tenant ID missing in GET /u/check-account after initJSXRoute",
        );
        return ctx.html(
          <MessagePage
            vendorSettings={vendorSettings} // Pass even if partial
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

      if (!authSession) {
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

      return ctx.html(
        <CheckEmailPage
          vendorSettings={vendorSettings}
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

      const { vendorSettings, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

      if (!client || !client.tenant?.id) {
        console.error(
          "Client or tenant ID missing in POST /u/check-account after initJSXRoute",
        );
        return ctx.html(
          <MessagePage
            vendorSettings={vendorSettings} // Pass even if partial
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

      if (!authSession) {
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

      const authResult = await createFrontChannelAuthResponse(ctx, {
        user,
        authParams: loginSession.authParams,
        client,
        loginSession,
      });

      if (!(authResult instanceof Response)) {
        throw new HTTPException(500, {
          message: i18next.t("unexpected_error_try_again"),
        });
      }
      return authResult;
    },
  );
