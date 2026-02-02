import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { loginWithPassword } from "../../authentication-flows/password";
import { passwordlessGrant } from "../../authentication-flows/passwordless";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";
import { nanoid } from "nanoid";
import { TokenResponse } from "@authhero/adapter-interfaces";
import { stringifyAuth0Client } from "../../utils/client-info";
import { setTenantId } from "../../helpers/set-tenant-id";
import { getEnrichedClient } from "../../helpers/client";

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
      const client = await getEnrichedClient(ctx.env, client_id);
      ctx.set("client_id", client_id);
      setTenantId(ctx, client.tenant.id);

      const email = username.toLocaleLowerCase();
      const ip = ctx.get("ip");
      const useragent = ctx.get("useragent");
      const auth0_client = ctx.get("auth0_client");

      let response: Response | TokenResponse;

      if ("otp" in body) {
        response = await passwordlessGrant(ctx, {
          client_id,
          username: email,
          otp: body.otp,
        });
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
            csrf_token: nanoid(),
            ip,
            useragent,
            auth0Client: stringifyAuth0Client(auth0_client),
          },
        );

        // This will throw if the login fails
        response = await loginWithPassword(
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

      if (!(response instanceof Response)) {
        throw new HTTPException(500, {
          message: "Unexpected response from loginWithPassword",
        });
      }
      return response;
    },
  );
