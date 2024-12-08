import {
  GrantType,
  clientCredentialGrantTypeParamsSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { clientCredentialsGrant } from "../../authentication-flows/client-credentials";

const clientCredentialsSchema = z.object({
  grant_type: z.literal("client_credentials"),
  audience: z.string(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

const implicitSchema = z.object({
  grant_type: z.literal("implicit"),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

const CreateRequestSchema = z.union([clientCredentialsSchema, implicitSchema]);

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
              //   schema: z.object({
              //     grant_type: z.enum([
              //       "authorization_code",
              //       "client_credentials",
              //       "password",
              //       "refresh_token",
              //     ]),
              //     audience: z.string().optional(),
              //     client_id: z.string().optional(),
              //     client_secret: z.string().optional(),
              //     code: z.string().optional(),
              //     redirect_uri: z.string().optional(),
              //     code_verifier: z.string().optional(),
              //     scope: z.string().optional(),
              //     username: z.string().optional(),
              //     password: z.string().optional(),
              //     refresh_token: z.string().optional(),
              //   }),
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

      const authHeader = ctx.req.header("authorization");
      if (authHeader) {
        const [type, token] = authHeader.split(" ");
        if (type?.toLowerCase() === "basic" && token) {
          const [client_id, client_secret] = Buffer.from(token, "base64")
            .toString()
            .split(":");
          body.client_id = body.client_id || client_id;
          body.client_secret = body.client_secret || client_secret;
        }
      }

      if (!body.client_id) {
        throw new HTTPException(400, { message: "client_id is required" });
      }

      switch (body.grant_type) {
        case GrantType.ClientCredential:
          return ctx.json(await clientCredentialsGrant(ctx, body));
        default:
          throw new HTTPException(400, { message: "Not implemented" });
      }
    },
  );
