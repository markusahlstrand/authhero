import { verifyRequestOrigin } from "oslo/request";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  AuthParams,
  AuthorizationResponseMode,
  AuthorizationResponseType,
  CodeChallengeMethod,
  tokenResponseSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { isValidRedirectUrl } from "../../utils/is-valid-redirect-url";
import { getAuthCookie } from "../../utils/cookies";
import { universalAuth } from "../../authentication-flows/universal";
import { ticketAuth } from "../../authentication-flows/ticket";
import { silentAuth } from "../../authentication-flows/silent";
import { connectionAuth } from "../../authentication-flows/connection";
import { getClientWithDefaults } from "../../helpers/client";

// const UI_STRATEGIES = [
//   "email",
//   "sms",
//   "auth0",
//   "authhero",
//   // TODO: this is a legacy strategy. Remove once migrated
//   "Username-Password-Authentication",
// ];

export const authorizeRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /authorize
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          client_id: z.string(),
          vendor_id: z.string().optional(),
          redirect_uri: z.string(),
          scope: z.string().optional(),
          state: z.string(),
          prompt: z.string().optional(),
          response_mode: z.nativeEnum(AuthorizationResponseMode).optional(),
          response_type: z.nativeEnum(AuthorizationResponseType).optional(),
          audience: z.string().optional(),
          connection: z.string().optional(),
          nonce: z.string().optional(),
          max_age: z.string().optional(),
          login_ticket: z.string().optional(),
          code_challenge_method: z.nativeEnum(CodeChallengeMethod).optional(),
          code_challenge: z.string().optional(),
          realm: z.string().optional(),
          auth0Client: z.string().optional(),
          organization: z.string().optional(),
          login_hint: z.string().optional(),
          screen_hint: z
            .string()
            .openapi({
              example: "signup",
              description:
                'Optional hint for the screen to show, like "signup" or "login".',
            })
            .optional(),
          ui_locales: z.string().optional(),
        }),
      },
      responses: {
        200: {
          description:
            "Successful authorization response. This can be an HTML page (e.g., for silent authentication iframe or universal login page) or a JSON object containing tokens (e.g., for response_mode=web_message).",
          content: {
            "text/html": {
              schema: z.string().openapi({ example: "<html>...</html>" }),
            },
            "application/json": {
              schema: tokenResponseSchema,
            },
          },
        },
        302: {
          description:
            "Redirect to the client's redirect URI, an authentication page, or an external identity provider.",
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
        403: {
          description:
            "Forbidden. The request is not allowed (e.g., invalid origin).",
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
      const {
        client_id,
        vendor_id,
        redirect_uri,
        scope,
        state,
        audience,
        nonce,
        connection,
        response_type,
        response_mode,
        code_challenge,
        code_challenge_method,
        prompt,
        login_ticket,
        realm,
        auth0Client,
        login_hint,
        ui_locales,
        organization,
      } = ctx.req.valid("query");

      ctx.set("log", "authorize");

      const client = await getClientWithDefaults(env, client_id);
      ctx.set("client_id", client.id);
      ctx.set("tenant_id", client.tenant.id);

      const authParams: AuthParams = {
        redirect_uri,
        scope,
        state,
        client_id,
        vendor_id,
        audience,
        nonce,
        prompt,
        response_type,
        response_mode,
        code_challenge,
        code_challenge_method,
        username: login_hint,
        ui_locales,
        organization,
      };

      const origin = ctx.req.header("origin");
      if (origin && !verifyRequestOrigin(origin, client.web_origins || [])) {
        throw new HTTPException(403, {
          message: `Origin ${origin} not allowed`,
        });
      }

      if (authParams.redirect_uri) {
        if (
          !isValidRedirectUrl(authParams.redirect_uri, client.callbacks || [], {
            allowPathWildcards: true,
          })
        ) {
          throw new HTTPException(400, {
            message: `Invalid redirect URI - ${authParams.redirect_uri}`,
          });
        }
      }

      // Fetch the cookie
      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );

      const session = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : undefined;
      const validSession = session && !session.revoked_at ? session : undefined;

      // Silent authentication with iframe
      if (prompt == "none") {
        if (!response_type) {
          throw new HTTPException(400, {
            message: "Missing response_type",
          });
        }

        // silentAuth returns Promise<Response>, which is fine directly.
        return silentAuth({
          ctx,
          session: validSession || undefined,
          redirect_uri,
          state,
          response_type,
          client,
          nonce,
          code_challenge_method,
          code_challenge,
          audience,
          scope,
        });
      }

      // If there's only one connection and it's not a u
      // if (
      //   client.connections.length === 1 &&
      //   !UI_STRATEGIES.includes(client.connections[0].strategy || "")
      // ) {
      //   return socialAuth(ctx, client, client.connections[0].name, authParams);
      // }

      // Connection auth flow
      if (connection && connection !== "email") {
        // connectionAuth returns Promise<Response>, which is fine directly.
        return connectionAuth(ctx, client, connection, authParams);
      } else if (login_ticket) {
        const ticketAuthResult = await ticketAuth(
          ctx,
          client.tenant.id,
          login_ticket,
          authParams,
          realm!,
        );

        if (ticketAuthResult instanceof Response) {
          return ticketAuthResult;
        } else {
          // ticketAuthResult is TokenResponse
          return ctx.json(ticketAuthResult);
        }
      }

      // universalAuth can return Promise<TokenResponse | Response>
      const universalAuthResult = await universalAuth({
        ctx,
        client,
        auth0Client,
        authParams,
        session: validSession || undefined,
        connection,
        login_hint,
      });

      if (universalAuthResult instanceof Response) {
        return universalAuthResult;
      } else {
        // universalAuthResult is TokenResponse
        return ctx.json(universalAuthResult);
      }
    },
  );
