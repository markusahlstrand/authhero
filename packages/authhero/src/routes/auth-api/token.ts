import {
  GrantType,
  tokenResponseSchema,
  TokenResponse,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  clientCredentialsGrant,
  clientCredentialGrantParamsSchema,
} from "../../authentication-flows/client-credentials";
import {
  authorizationCodeGrantParamsSchema,
  authorizationCodeGrantUser,
} from "../../authentication-flows/authorization-code";
import {
  refreshTokenGrant,
  refreshTokenParamsSchema,
} from "../../authentication-flows/refresh-token";
import {
  passwordlessGrantParamsSchema,
  passwordlessGrantUser,
} from "../../authentication-flows/passwordless";
import { createAuthTokens } from "../../authentication-flows/common";
import { serializeAuthCookie } from "../../utils/cookies";

const optionalClientCredentials = z.object({
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

// We need to make the client_id and client_secret optional on each type as it can be passed in a auth-header
const CreateRequestSchema = z.union([
  // Client credentials
  clientCredentialGrantParamsSchema.extend(optionalClientCredentials.shape),
  // PKCE. This needs to be before the normal code grant as the client_secret is optional here
  z.object({
    grant_type: z.literal("authorization_code"),
    client_id: z.string(),
    code: z.string(),
    redirect_uri: z.string(),
    code_verifier: z.string().min(43).max(128),
  }),
  // Code grant
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string(),
    redirect_uri: z.string().optional(),
    ...optionalClientCredentials.shape,
  }),
  // Refresh token
  z.object({
    grant_type: z.literal("refresh_token"),
    client_id: z.string(),
    refresh_token: z.string(),
    redirect_uri: z.string().optional(),
  }),
  // OTP
  z.object({
    grant_type: z.literal("http://auth0.com/oauth/grant-type/passwordless/otp"),
    client_id: z.string(),
    username: z.string(),
    otp: z.string(),
    realm: z.enum(["email", "sms"]),
  }),
]);

function parseBasicAuthHeader(authHeader?: string) {
  if (!authHeader) {
    return {};
  }

  const [type, token] = authHeader.split(" ");
  if (type?.toLowerCase() === "basic" && token) {
    const [client_id, client_secret] = atob(token).split(":");
    return { client_id, client_secret };
  }
  return {};
}

export const tokenRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // POST /oauth/token
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth2"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: CreateRequestSchema,
            },
          },
        },
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: tokenResponseSchema,
            },
          },
          description: "Tokens",
        },
        302: {
          description:
            "Redirect for further user interaction (e.g., MFA, consent).",
          headers: z.object({ Location: z.string().url() }).openapi({}),
        },
        400: {
          description: "Bad Request - The request was malformed or invalid.",
          content: {
            "application/json": {
              schema: z.object({
                error: z.string(),
                error_description: z.string().optional(),
              }),
            },
          },
        },
        401: {
          description: "Unauthorized - Client authentication failed.",
          content: {
            "application/json": {
              schema: z.object({
                error: z.string(),
                error_description: z.string().optional(),
              }),
            },
          },
        },
      },
    }),
    async (ctx) => {
      const body = ctx.req.valid("form");

      const basicAuth = parseBasicAuthHeader(ctx.req.header("Authorization"));
      const params = { ...body, ...basicAuth };

      if (!params.client_id) {
        throw new HTTPException(400, { message: "client_id is required" });
      }
      ctx.set("client_id", params.client_id);

      let grantResult: TokenResponse | Response;

      switch (body.grant_type) {
        case GrantType.AuthorizationCode:
          const codeGrantResult = await authorizationCodeGrantUser(
            ctx,
            authorizationCodeGrantParamsSchema.parse(params),
          );

          const headers = new Headers();

          if (codeGrantResult.session_id) {
            const codeGrantAuthCookie = serializeAuthCookie(
              codeGrantResult.client.tenant.id,
              codeGrantResult.session_id,
              ctx.var.custom_domain || ctx.req.header("host") || "",
            );

            headers.set("Set-Cookie", codeGrantAuthCookie);
          }

          const codeGrantTokens = await createAuthTokens(ctx, codeGrantResult);
          return ctx.json(codeGrantTokens, {
            headers,
          });
        case GrantType.ClientCredential:
          grantResult = await clientCredentialsGrant(
            ctx,
            clientCredentialGrantParamsSchema.parse(params),
          );
          break;
        case GrantType.RefreshToken:
          grantResult = await refreshTokenGrant(
            ctx,
            refreshTokenParamsSchema.parse(params),
          );
          break;
        case GrantType.OTP:
          const passwordlessResult = await passwordlessGrantUser(
            ctx,
            passwordlessGrantParamsSchema.parse(params),
          );

          const passwordlessHeaders = new Headers();

          if (passwordlessResult.session_id) {
            const passwordlessAuthCookie = serializeAuthCookie(
              passwordlessResult.client.tenant.id,
              passwordlessResult.session_id,
              ctx.var.custom_domain || ctx.req.header("host") || "",
            );

            passwordlessHeaders.set("Set-Cookie", passwordlessAuthCookie);
          }

          const tokens = await createAuthTokens(ctx, passwordlessResult);
          return ctx.json(tokens, {
            headers: passwordlessHeaders,
          });
        default:
          return ctx.json(
            {
              error: "unsupported_grant_type",
              error_description: "Grant type not implemented",
            },
            400,
          );
      }

      if (grantResult instanceof Response) {
        // This is a raw Response object from a grant function.
        // We need to inspect it and use appropriate ctx methods.
        const status = grantResult.status;
        const location = grantResult.headers.get("Location");

        if (status === 302 && location) {
          return ctx.redirect(location, 302);
        }

        // For other raw Response objects, attempt to parse as JSON error
        // This assumes error responses from grant flows might be raw Response with JSON body
        try {
          const errorBody = await grantResult.json();
          return ctx.json(errorBody, status as any);
        } catch (e) {
          // If not JSON, or other issue, return a generic server error
          console.error("Failed to process raw Response from grant flow:", e);
          return ctx.json(
            {
              error: "server_error",
              error_description:
                "Invalid response format from authentication flow.",
            },
            500,
          );
        }
      } else {
        // grantResult is TokenResponse
        return ctx.json(grantResult);
      }
    },
  );
