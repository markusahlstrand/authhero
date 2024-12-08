import {
  authorizationCodeGrantTypeParamsSchema,
  clientCredentialGrantTypeParamsSchema,
  GrantType,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { clientCredentialsGrant } from "../../authentication-flows/client-credentials";
import { authorizationCodeGrant } from "../../authentication-flows/authorization-code";

const clientCredentialsSchema = z.object({
  grant_type: z.literal("client_credentials"),
  audience: z.string(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

const authorizationCodeSchema = z.object({
  grant_type: z.literal("authorization_code"),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  code: z.string(),
  redirect_uri: z.string().optional(),
});

const authorizationCodeWithPKCESchema = z.object({
  grant_type: z.literal("authorization_code"),
  client_id: z.string(),
  code: z.string(),
  redirect_uri: z.string().optional(),
  code_challenge: z.string(),
  code_challenge_method: z.string(),
});

const CreateRequestSchema = z.union([
  clientCredentialsSchema,
  authorizationCodeSchema,
  authorizationCodeWithPKCESchema,
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
              schema: z.object({
                access_token: z.string(),
                id_token: z.string().optional(),
                refresh_token: z.string().optional(),
                token_type: z.string(),
                expires_in: z.number(),
              }),
            },
          },
          description: "Tokens",
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

      switch (body.grant_type) {
        case GrantType.AuthorizationCode:
          return ctx.json(
            await authorizationCodeGrant(
              ctx,
              authorizationCodeGrantTypeParamsSchema.parse(params),
            ),
          );
        case GrantType.ClientCredential:
          return ctx.json(
            await clientCredentialsGrant(
              ctx,
              clientCredentialGrantTypeParamsSchema.parse(params),
            ),
          );
        default:
          throw new HTTPException(400, { message: "Not implemented" });
      }
    },
  );
