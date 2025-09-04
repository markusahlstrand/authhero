import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { AuthParams } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { getAuthCookie } from "../../utils/cookies";
import { getClientWithDefaults } from "../../helpers/client";
import { nanoid } from "nanoid";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";
import { stringifyAuth0Client } from "../../utils/client-info";
import { getUniversalLoginUrl } from "../../variables";

export const accountRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /account
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          client_id: z.string(),
          redirect_url: z.string().optional(),
          login_hint: z.string().optional(),
        }),
      },
      responses: {
        302: {
          description:
            "Redirect to the account page with login session state or login page",
          headers: z.object({
            Location: z.string().url(),
          }),
        },
        400: {
          description:
            "Bad Request. Invalid parameters or other client-side errors.",
          content: {
            "application/json": {
              schema: z.object({
                message: z.string(),
              }),
            },
          },
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { client_id, redirect_url, login_hint } = ctx.req.valid("query");

      ctx.set("log", "account");

      const client = await getClientWithDefaults(env, client_id);
      ctx.set("client_id", client.id);
      ctx.set("tenant_id", client.tenant.id);

      const authParams: AuthParams = {
        redirect_uri: redirect_url || ctx.req.url,
        client_id,
        username: login_hint,
      };

      // Fetch the cookie to check for existing session
      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );

      const session = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : undefined;
      const validSession = session && !session.revoked_at ? session : undefined;

      const url = new URL(ctx.req.url);
      if (ctx.var.custom_domain) {
        url.hostname = ctx.var.custom_domain;
      }

      const { ip, auth0_client, useragent } = ctx.var;

      // Convert structured auth0_client back to string for storage
      const auth0Client = stringifyAuth0Client(auth0_client);

      // Create a login session to store the authParams and redirectUrl
      const loginSession = await env.data.loginSessions.create(
        client.tenant.id,
        {
          expires_at: new Date(
            Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
          ).toISOString(),
          authParams,
          csrf_token: nanoid(),
          authorization_url: url.toString(),
          ip,
          useragent,
          auth0Client,
        },
      );

      // If there's a valid session, connect it to the login session
      if (validSession) {
        // If login_hint is provided, check that the session user matches
        if (login_hint) {
          const user = await env.data.users.get(
            client.tenant.id,
            validSession.user_id,
          );

          // Only connect the session if the user email matches the login_hint
          if (user?.email !== login_hint) {
            // Session user doesn't match login_hint, redirect to login
            return ctx.redirect(
              `${getUniversalLoginUrl(ctx.env)}login/identifier?state=${loginSession.id}`,
            );
          }
        }

        // Connect the login session to the existing session
        await env.data.loginSessions.update(client.tenant.id, loginSession.id, {
          session_id: validSession.id,
        });

        // Redirect to the account page with the login session state
        return ctx.redirect(`/u/account?state=${loginSession.id}`);
      }

      // No valid session, redirect to login
      return ctx.redirect(
        `${getUniversalLoginUrl(ctx.env)}login/identifier?state=${loginSession.id}`,
      );
    },
  );
