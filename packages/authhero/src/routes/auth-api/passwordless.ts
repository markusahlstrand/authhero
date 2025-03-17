import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  AuthParams,
  AuthorizationResponseType,
  authParamsSchema,
} from "@authhero/adapter-interfaces";
import { getClientInfo } from "../../utils/client-info";
import { Bindings, Variables } from "../../types";
import generateOTP from "../../utils/otp";
import { sendCode, sendLink } from "../../emails";
import { OTP_EXPIRATION_TIME } from "../../constants";
import { getClientWithDefaults } from "../../helpers/client";
import { loginWithPasswordless } from "../../authentication-flows/passwordless";
import { nanoid } from "nanoid";

export const passwordlessRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // POST /passwordless/start
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["passwordless"],
      method: "post",
      path: "/start",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                client_id: z.string(),
                connection: z.string(),
                email: z.string().transform((u) => u.toLowerCase()),
                send: z.enum(["link", "code"]),
                authParams: authParamsSchema.omit({ client_id: true }),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const body = ctx.req.valid("json");
      const { env } = ctx;
      const { client_id, email, send, authParams } = body;
      const client = await ctx.env.data.clients.get(client_id);
      if (!client) {
        throw new HTTPException(400, {
          message: "Client not found",
        });
      }
      ctx.set("client_id", client.id);
      ctx.set("tenant_id", client.tenant.id);

      const loginSession = await env.data.loginSessions.create(
        client.tenant.id,
        {
          authParams: { ...authParams, client_id, username: email },
          expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
          csrf_token: nanoid(),
          ...getClientInfo(ctx.req),
        },
      );

      const code = await env.data.codes.create(client.tenant.id, {
        code_id: generateOTP(),
        code_type: "otp",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
      });

      if (send === "link") {
        await sendLink(ctx, email, code.code_id, { ...authParams, client_id });
      } else {
        await sendCode(ctx, email, code.code_id);
      }

      return ctx.html("OK");
    },
  )
  // --------------------------------
  // GET /passwordless/verify_redirect
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["passwordless"],
      method: "get",
      path: "/verify_redirect",
      request: {
        query: z.object({
          scope: z.string(),
          response_type: z.nativeEnum(AuthorizationResponseType),
          redirect_uri: z.string(),
          state: z.string(),
          nonce: z.string().optional(),
          verification_code: z.string(),
          connection: z.string(),
          client_id: z.string(),
          email: z.string().transform((u) => u.toLowerCase()),
          audience: z.string().optional(),
        }),
      },
      responses: {
        302: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const {
        client_id,
        email,
        verification_code,
        redirect_uri,
        state,
        scope,
        audience,
        response_type,
        nonce,
      } = ctx.req.valid("query");
      const client = await getClientWithDefaults(env, client_id);

      ctx.set("client_id", client.id);
      ctx.set("tenant_id", client.tenant.id);
      ctx.set("connection", "email");

      const authParams: AuthParams = {
        client_id,
        redirect_uri,
        state,
        nonce,
        scope,
        audience,
        response_type,
      };

      return loginWithPasswordless(
        ctx,
        client,
        authParams,
        email,
        verification_code,
        false,
        true,
      );
    },
  );
