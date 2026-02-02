import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { AuthParams } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { getAuthCookie } from "../../utils/cookies";
import { getClientWithDefaults } from "../../helpers/client";
import { nanoid } from "nanoid";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";
import { stringifyAuth0Client } from "../../utils/client-info";
import { getIssuer, getUniversalLoginUrl } from "../../variables";
import { verifyRequestOrigin } from "../../utils/encoding";
import { HTTPException } from "hono/http-exception";
import { isValidRedirectUrl } from "../../utils/is-valid-redirect-url";
import { setTenantId } from "../../helpers/set-tenant-id";

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
          login_hint: z.string().toLowerCase().optional(),
          screen_hint: z
            .enum([
              "account",
              "change-email",
              "change-phone",
              "change-password",
            ])
            .optional()
            .default("account"),
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
      const { client_id, redirect_url, login_hint, screen_hint } =
        ctx.req.valid("query");

      ctx.set("log", "account");

      const client = await getClientWithDefaults(env, client_id);
      ctx.set("client_id", client.client_id);
      setTenantId(ctx, client.tenant.id);

      const authParams: AuthParams = {
        redirect_uri: redirect_url || ctx.req.url,
        client_id,
        username: login_hint,
      };

      const origin = ctx.req.header("origin");
      if (origin && !verifyRequestOrigin(origin, client.web_origins || [])) {
        throw new HTTPException(403, {
          message: `Origin ${origin} not allowed`,
        });
      }

      if (authParams.redirect_uri) {
        const validCallbacks = client.callbacks || [];
        if (ctx.var.host) {
          // Allow wildcard for the auth server
          validCallbacks.push(`${getIssuer(ctx.env)}/*`);
          validCallbacks.push(`${getUniversalLoginUrl(ctx.env)}/*`);
        }

        if (
          !isValidRedirectUrl(authParams.redirect_uri, validCallbacks, {
            allowPathWildcards: true,
            allowSubDomainWildcards: true,
          })
        ) {
          throw new HTTPException(400, {
            message: `Invalid redirect URI - ${authParams.redirect_uri}`,
          });
        }
      }

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
              `${getUniversalLoginUrl(ctx.env)}login/identifier?state=${encodeURIComponent(loginSession.id)}`,
            );
          }
        }

        // Connect the login session to the existing session
        await env.data.loginSessions.update(client.tenant.id, loginSession.id, {
          session_id: validSession.id,
        });

        // Redirect based on screen_hint
        if (screen_hint === "change-email") {
          const changeEmailUrl = new URL(
            "/u/account/change-email",
            ctx.req.url,
          );
          changeEmailUrl.searchParams.set("state", loginSession.id);
          return ctx.redirect(changeEmailUrl.toString());
        }

        // Redirect to the account page with the login session state
        const accountUrl = new URL("/u/account", ctx.req.url);
        accountUrl.searchParams.set("state", loginSession.id);

        return ctx.redirect(accountUrl.toString());
      }

      // No valid session, redirect to login
      return ctx.redirect(
        `${getUniversalLoginUrl(ctx.env)}login/identifier?state=${encodeURIComponent(loginSession.id)}`,
      );
    },
  );
