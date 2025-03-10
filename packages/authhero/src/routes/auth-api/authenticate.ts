import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { loginWithPassword } from "../../authentication-flows/password";
import { loginWithPasswordless } from "../../authentication-flows/passwordless";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";
import { getClientInfo } from "../../utils/client-info";

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
              schema: z.union([
                z.object({
                  credential_type: z.literal(
                    "http://auth0.com/oauth/grant-type/passwordless/otp",
                  ),
                  otp: z.string(),
                  client_id: z.string(),
                  username: z.string().transform((v) => v.toLowerCase()),
                  realm: z.enum(["email"]),
                  scope: z.string().optional(),
                }),
                z.object({
                  credential_type: z.literal(
                    "http://auth0.com/oauth/grant-type/password-realm",
                  ),
                  client_id: z.string(),
                  username: z.string().transform((v) => v.toLowerCase()),
                  password: z.string(),
                  realm: z.enum(["Username-Password-Authentication"]),
                  scope: z.string().optional(),
                }),
              ]),
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
      const body = ctx.req.valid("json");
      const { client_id, username } = body;
      ctx.set("username", username);
      const client = await ctx.env.data.clients.get(client_id);
      if (!client) {
        throw new HTTPException(400, {
          message: "Client not found",
        });
      }
      ctx.set("client_id", client_id);
      ctx.set("tenant_id", client.tenant.id);

      const email = username.toLocaleLowerCase();

      if ("otp" in body) {
        return loginWithPasswordless(
          ctx,
          client,
          { client_id, username: email },
          email,
          body.otp,
          true,
        );
      } else if ("password" in body) {
        const loginSession = await ctx.env.data.loginSessions.create(
          client.tenant.id,
          {
            expires_at: new Date(
              Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
            ).toISOString(),
            authParams: {
              client_id,
              username: email,
            },
            ...getClientInfo(ctx.req),
          },
        );

        // This will throw if the login fails
        return loginWithPassword(
          ctx,
          client,
          {
            username: email,
            password: body.password,
            client_id,
          },
          loginSession,
          true,
        );
      } else {
        throw new HTTPException(400, { message: "Code or password required" });
      }
    },
  );
