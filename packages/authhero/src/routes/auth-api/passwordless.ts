import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  AuthParams,
  AuthorizationResponseType,
  authParamsSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import generateOTP from "../../utils/otp";
import { sendCode, sendLink } from "../../emails";
import { OTP_EXPIRATION_TIME } from "../../constants";
import {
  getClientWithDefaults,
  getEnrichedClient,
} from "../../helpers/client";
import { passwordlessGrant } from "../../authentication-flows/passwordless";
import { nanoid } from "nanoid";
import { stringifyAuth0Client } from "../../utils/client-info";
import { getUniversalLoginUrl } from "../../variables";
import { setTenantId } from "../../helpers/set-tenant-id";

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
              schema: z.union([
                z.object({
                  connection: z.literal("email"),
                  client_id: z.string(),
                  email: z.string().transform((u) => u.toLowerCase()),
                  send: z.enum(["link", "code"]),
                  authParams: authParamsSchema.omit({ client_id: true }),
                }),
                z.object({
                  client_id: z.string(),
                  connection: z.literal("sms"),
                  phone_number: z.string(),
                  send: z.enum(["link", "code"]),
                  authParams: authParamsSchema.omit({ client_id: true }),
                }),
              ]),
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
      const { client_id, send, authParams, connection } = body;
      const client = await getEnrichedClient(ctx.env, client_id);
      ctx.set("client_id", client.client_id);
      setTenantId(ctx, client.tenant.id);

      const username = connection === "email" ? body.email : body.phone_number;

      const ip = ctx.get("ip");
      const useragent = ctx.get("useragent");
      const auth0_client = ctx.get("auth0_client");

      // Convert structured auth0_client back to string for storage
      const auth0Client = stringifyAuth0Client(auth0_client);

      const loginSession = await env.data.loginSessions.create(
        client.tenant.id,
        {
          authParams: { ...authParams, client_id, username },
          expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
          csrf_token: nanoid(),
          ip,
          useragent,
          auth0Client,
        },
      );

      const code = await env.data.codes.create(client.tenant.id, {
        code_id: generateOTP(),
        code_type: "otp",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
        redirect_uri: authParams.redirect_uri,
      });

      // Extract language from ui_locales
      const language = authParams?.ui_locales
        ?.split(" ")
        ?.map((locale) => locale.split("-")[0])[0];

      if (send === "link") {
        await sendLink(ctx, {
          to: username,
          code: code.code_id,
          authParams: {
            ...authParams,
            client_id,
          },
          language,
        });
      } else {
        await sendCode(ctx, {
          to: username,
          code: code.code_id,
          language,
        });
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
          description: "Successful verification, redirecting to continue flow.",
          headers: z.object({ Location: z.string().url() }).openapi({}), // Added Location header spec
        },
        400: {
          description:
            "Bad Request (e.g., invalid client, invalid code, missing parameters).",
          content: {
            "application/json": {
              schema: z.object({
                error: z.string(),
                error_description: z.string().optional(),
              }),
            },
          },
        },
        500: {
          description: "Internal Server Error.",
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

      ctx.set("client_id", client.client_id);
      setTenantId(ctx, client.tenant.id);
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

      let errorMessage = "Something went wrong. Please try again later.";
      try {
        const result = await passwordlessGrant(ctx, {
          client_id,
          username: email,
          otp: verification_code,
          authParams,
          enforceIpCheck: true,
        });

        if (result instanceof Response) {
          return result;
        } else if (
          result &&
          typeof result === "object" &&
          "access_token" in result
        ) {
          return ctx.json(result);
        }
      } catch (err: unknown) {
        const error = err as Error;
        if ("message" in error && typeof error.message === "string") {
          errorMessage = error.message;
        }
      }

      // Create a new login session with the error message
      const ip = ctx.get("ip");
      const useragent = ctx.get("useragent");
      const auth0_client = ctx.get("auth0_client");

      // Convert structured auth0_client back to string for storage
      const auth0Client = stringifyAuth0Client(auth0_client);

      const loginSession = await env.data.loginSessions.create(
        client.tenant.id,
        {
          authParams: {
            ...authParams,
            username: email,
          },
          expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
          csrf_token: nanoid(),
          ip,
          useragent,
          auth0Client,
        },
      );

      return ctx.redirect(
        `${getUniversalLoginUrl(ctx.env)}invalid-session?state=${loginSession.id}&error=${encodeURIComponent(errorMessage)}`,
        302,
      );
    },
  );
