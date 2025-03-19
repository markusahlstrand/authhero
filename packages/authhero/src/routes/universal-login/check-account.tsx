import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import CheckEmailPage from "../../components/CheckEmailPage";
import { getAuthCookie } from "../../utils/cookies";
import { createAuthResponse } from "../../authentication-flows/common";

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
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { state } = ctx.req.valid("query");

      const { vendorSettings, client } = await initJSXRoute(ctx, state);

      // Fetch the cookie
      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );

      const authSession = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : null;

      if (!authSession) {
        return ctx.redirect(`/u/enter-email?state=${state}`);
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(`/u/enter-email?state=${state}`);
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
          description: "Redirect",
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { state } = ctx.req.valid("query");

      const { loginSession, client } = await initJSXRoute(ctx, state);

      // Fetch the cookie
      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );
      const authSession = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : null;

      if (!authSession) {
        return ctx.redirect(`/u/enter-email?state=${state}`);
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(`/u/enter-email?state=${state}`);
      }

      return createAuthResponse(ctx, {
        user,
        authParams: loginSession.authParams,
        client,
        loginSession,
      });
    },
  );
