import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";

const requestSchema = z.union([
  z.object({
    credential_type: z.literal(
      "http://auth0.com/oauth/grant-type/passwordless/otp",
    ),
    otp: z.string(),
    client_id: z.string(),
    realm: z.literal("email"),
    scope: z.string().optional(),
  }),
  z.object({
    credential_type: z.literal(
      "http://auth0.com/oauth/grant-type/password-realm",
    ),
    client_id: z.string(),
    username: z.string().transform((v) => v.toLowerCase()),
    password: z.string(),
    realm: z.literal("Username-Password-Authentication"),
    scope: z.string().optional(),
  }),
]);

export const authenticateRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // POST /co/authenticate
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: requestSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: "List of tenants",
        },
      },
    }),
    async (ctx) => {
      const { client_id, credential_type } = ctx.req.valid("json");
      const client = await ctx.env.data.clients.get(client_id);
      if (!client) {
        throw new HTTPException(400, {
          message: "Invalid client",
        });
      }

      ctx.set("client_id", client_id);

      switch (credential_type) {
        case "http://auth0.com/oauth/grant-type/password-realm":
        case "http://auth0.com/oauth/grant-type/passwordless/otp":
        default:
          throw new HTTPException(400, {
            message: "Credential type not supported",
          });
      }
    },
  );
