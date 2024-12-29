import { verifyRequestOrigin } from "oslo/request";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  AuthParams,
  AuthorizationResponseMode,
  AuthorizationResponseType,
  CodeChallengeMethod,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { isValidRedirectUrl } from "../../utils/is-valid-redirect-url";
import { getAuthCookie } from "../../utils/cookies";
import { universalAuth } from "../../authentication-flows/universal";
import { ticketAuth } from "../../authentication-flows/ticket";
import { silentAuth } from "../../authentication-flows/silent";
import { connectionAuth } from "../../authentication-flows/connection";

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
          login_hint: z.string().optional(),
          ui_locales: z.string().optional(),
        }),
      },
      responses: {
        200: {
          description: "Silent authentication page",
        },
        302: {
          description: "Redirect to the client's redirect uri",
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
        code_challenge,
        code_challenge_method,
        prompt,
        login_ticket,
        realm,
        auth0Client,
        login_hint,
        ui_locales,
      } = ctx.req.valid("query");

      const client = await env.data.clients.get(client_id);
      if (!client) {
        throw new HTTPException(400, {
          message: "Client not found",
        });
      }
      ctx.set("client_id", client.id);

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
        code_challenge,
        code_challenge_method,
        username: login_hint,
        ui_locales,
      };

      const origin = ctx.req.header("origin");
      if (origin && !verifyRequestOrigin(origin, client.web_origins || [])) {
        throw new HTTPException(403, {
          message: `Origin ${origin} not allowed`,
        });
      }

      if (authParams.redirect_uri) {
        if (!isValidRedirectUrl(authParams.redirect_uri, client.callbacks)) {
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

      // Silent authentication with iframe
      if (prompt == "none") {
        if (!response_type) {
          throw new HTTPException(400, {
            message: "Missing response_type",
          });
        }

        return silentAuth({
          ctx,
          session: session || undefined,
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
        return connectionAuth(ctx, client, connection, authParams);
      } else if (login_ticket) {
        return ticketAuth(
          ctx,
          client.tenant.id,
          login_ticket,
          authParams,
          realm!,
        );
      }

      return universalAuth({
        ctx,
        client,
        auth0Client,
        authParams,
        session: session || undefined,
        connection,
        login_hint,
      });
    },
  );
