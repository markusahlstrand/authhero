import { GrantType, tokenResponseSchema } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  clientCredentialsGrant,
  clientCredentialGrantParamsSchema,
} from "../../authentication-flows/client-credentials";
import {
  authorizationCodeGrant,
  authorizationCodeGrantParamsSchema,
} from "../../authentication-flows/authorization-code";
import {
  refreshTokenGrant,
  refreshTokenParamsSchema,
} from "../../authentication-flows/refresh-token";
import {
  passwordlessGrant,
  passwordlessGrantParamsSchema,
} from "../../authentication-flows/passwordless";

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
      },
    }),
    // @ts-ignore
    async (ctx) => {
      const body = ctx.req.valid("form");

      const basicAuth = parseBasicAuthHeader(ctx.req.header("Authorization"));
      const params = { ...body, ...basicAuth };

      if (!params.client_id) {
        throw new HTTPException(400, { message: "client_id is required" });
      }
      ctx.set("client_id", params.client_id);

      switch (body.grant_type) {
        case GrantType.AuthorizationCode:
          return authorizationCodeGrant(
            ctx,
            authorizationCodeGrantParamsSchema.parse(params),
          );
        case GrantType.ClientCredential:
          return clientCredentialsGrant(
            ctx,
            clientCredentialGrantParamsSchema.parse(params),
          );
        case GrantType.RefreshToken:
          return refreshTokenGrant(ctx, refreshTokenParamsSchema.parse(params));
        case GrantType.OTP:
          return passwordlessGrant(
            ctx,
            passwordlessGrantParamsSchema.parse(params),
          );
        default:
          throw new HTTPException(400, { message: "Not implemented" });
      }
    },
  );
