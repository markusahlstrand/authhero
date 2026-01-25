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
import { getIssuer, getUniversalLoginUrl } from "../../variables";
import { setTenantId } from "../../helpers/set-tenant-id";

const UI_STRATEGIES = ["email", "sms", "Username-Password-Authentication"];

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
          acr_values: z.string().optional(),
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
        max_age,
        acr_values,
        login_ticket,
        realm,
        auth0Client,
        login_hint,
        ui_locales,
        organization,
      } = ctx.req.valid("query");

      ctx.set("log", "authorize");

      const client = await getClientWithDefaults(env, client_id);
      ctx.set("client_id", client.client_id);
      setTenantId(ctx, client.tenant.id);

      // Sanitize redirect_uri: remove fragment and OAuth-related query params
      // This prevents issues when users start a new login from a page that already
      // has error/code params from a previous authentication attempt
      let sanitizedRedirectUri: string | undefined = redirect_uri;
      if (typeof redirect_uri === "string") {
        const fragmentStripped = redirect_uri.split("#")[0]!;
        try {
          const redirectUrl = new URL(fragmentStripped);
          // Remove OAuth response parameters that might be left over from previous attempts
          const oauthParams = [
            "code",
            "error",
            "error_description",
            "error_uri",
            "state",
          ];
          oauthParams.forEach((param) => redirectUrl.searchParams.delete(param));
          sanitizedRedirectUri = redirectUrl.toString();
        } catch {
          // If URL parsing fails, use the original (fragment-stripped) value
          sanitizedRedirectUri = fragmentStripped;
        }
      }

      const origin = ctx.req.header("origin");
      if (origin && !verifyRequestOrigin(origin, client.web_origins || [])) {
        throw new HTTPException(403, {
          message: `Origin ${origin} not allowed`,
        });
      }

      // Validate required parameter: response_type (per OIDC Core 3.1.2.1)
      if (!response_type) {
        // If redirect_uri is valid, redirect back with error as per OIDC spec
        if (sanitizedRedirectUri) {
          const redirectUrl = new URL(sanitizedRedirectUri);
          redirectUrl.searchParams.set("error", "invalid_request");
          redirectUrl.searchParams.set(
            "error_description",
            "Missing required parameter: response_type",
          );
          if (state) {
            redirectUrl.searchParams.set("state", state);
          }
          return ctx.redirect(redirectUrl.toString());
        }
        // No redirect_uri, throw HTTP exception
        throw new HTTPException(400, {
          message: "Missing required parameter: response_type",
        });
      }

      const authParams: AuthParams = {
        redirect_uri: sanitizedRedirectUri,
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
        max_age: max_age ? parseInt(max_age, 10) : undefined,
        acr_values,
      };

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
        return silentAuth({
          ctx,
          session: validSession || undefined,
          redirect_uri,
          state,
          response_type,
          response_mode,
          client,
          nonce,
          code_challenge_method,
          code_challenge,
          audience,
          scope,
          organization,
          max_age: max_age ? parseInt(max_age, 10) : undefined,
        });
      }

      // If there's only one connection and it's a OIDC provider, we can redirect to that provider directly
      if (
        client.connections.length === 1 &&
        client.connections[0] &&
        !UI_STRATEGIES.includes(client.connections[0].strategy || "")
      ) {
        return connectionAuth(
          ctx,
          client,
          client.connections[0].name,
          authParams,
        );
      }

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
          return ctx.json(ticketAuthResult);
        }
      }

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
        return ctx.json(universalAuthResult);
      }
    },
  );
