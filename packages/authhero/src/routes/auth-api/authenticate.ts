import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { loginWithPassword } from "../../authentication-flows/password";
import { Login } from "@authhero/adapter-interfaces";
import { getClientInfo } from "../../utils/client-info";
import { generateCodeVerifier } from "oslo/oauth2";

function createUnauthorizedResponse() {
  return new HTTPException(403, {
    res: new Response(
      JSON.stringify({
        error: "access_denied",
        error_description: "Wrong email or verification code.",
      }),
      {
        status: 403, // without this it returns a 200
        headers: {
          "Content-Type": "application/json",
        },
      },
    ),
    message: "Wrong email or verification code.",
  });
}

const TICKET_EXPIRATION_TIME = 30 * 60 * 1000;

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

      let loginSession: Login;

      if ("otp" in body) {
        const code = await ctx.env.data.codes.get(
          client.tenant.id,
          body.otp,
          "otp",
        );
        if (!code) {
          throw createUnauthorizedResponse();
        }

        const existingLoginSession = await ctx.env.data.logins.get(
          client.tenant.id,
          code.login_id,
        );
        if (
          !existingLoginSession ||
          existingLoginSession.authParams.username !== email
        ) {
          throw createUnauthorizedResponse();
        }

        loginSession = existingLoginSession;
      } else if ("password" in body) {
        // This will throw if the login fails
        await loginWithPassword(ctx, client, {
          username,
          password: body.password,
          client_id,
        });

        loginSession = await ctx.env.data.logins.create(client.tenant.id, {
          expires_at: new Date(
            Date.now() + TICKET_EXPIRATION_TIME,
          ).toISOString(),
          authParams: {
            client_id: client.id,
            username: email,
          },
          ...getClientInfo(ctx.req),
        });
      } else {
        throw new HTTPException(400, { message: "Code or password required" });
      }

      const co_verifier = generateCodeVerifier();
      const co_id = nanoid(12);

      const code = await ctx.env.data.codes.create(client.tenant.id, {
        code_id: nanoid(),
        code_type: "ticket",
        login_id: loginSession.login_id,
        expires_at: new Date(Date.now() + TICKET_EXPIRATION_TIME).toISOString(),
        // Concat the co_id and co_verifier
        code_verifier: [co_id, co_verifier].join("|"),
      });

      return ctx.json({
        login_ticket: code.code_id,
        co_verifier,
        co_id,
      });
    },
  );
