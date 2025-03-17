import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute, usePasswordLogin } from "./common";
import EnterEmailPage from "../../components/EnterEmailPage";
import { getPrimaryUserByEmail } from "../../helpers/users";
import { preUserSignupHook } from "../../hooks";
import { createLogMessage } from "../../utils/create-log-message";
import { LogTypes } from "@authhero/adapter-interfaces";
import i18next from "i18next";
import generateOTP from "../../utils/otp";
import { waitUntil } from "../../helpers/wait-until";
import { sendCode, sendLink } from "../../emails";
import { OTP_EXPIRATION_TIME } from "../../constants";

type Auth0Client = {
  name: string;
  version: string;
};

const APP_CLIENT_IDS = ["Auth0.swift"];

export type SendType = "link" | "code";

export function getSendParamFromAuth0ClientHeader(
  auth0ClientHeader?: string,
): SendType {
  if (!auth0ClientHeader) {
    return "code";
  }

  const decodedAuth0Client = atob(auth0ClientHeader);

  const auth0Client = JSON.parse(decodedAuth0Client) as Auth0Client;

  const isAppClient = APP_CLIENT_IDS.includes(auth0Client.name);

  return isAppClient ? "code" : "link";
}

export const enterEmailRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/enter-email
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
          impersonation: z.string().optional(),
        }),
      },
      responses: {
        200: {
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { state, impersonation } = ctx.req.valid("query");

      const { vendorSettings, loginSession, client } = await initJSXRoute(
        ctx,
        state,
      );

      return ctx.html(
        <EnterEmailPage
          vendorSettings={vendorSettings}
          loginSession={loginSession}
          client={client}
          email={loginSession.authParams.username}
          impersonation={impersonation === "true"}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/enter-email
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "post",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                username: z.string().transform((u) => u.toLowerCase()),
                act_as: z
                  .string()
                  .transform((u) => u.toLowerCase())
                  .optional(),
                login_selection: z.enum(["code", "password"]).optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { state } = ctx.req.valid("query");
      const params = ctx.req.valid("form");
      ctx.set("body", params);
      ctx.set("username", params.username);

      const { client, loginSession, vendorSettings } = await initJSXRoute(
        ctx,
        state,
      );
      ctx.set("client_id", client.id);

      const username = params.username;

      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: client.tenant.id,
        email: username,
      });
      if (user) {
        ctx.set("user_id", user.user_id);
      }

      if (!user) {
        try {
          await preUserSignupHook(ctx, client, ctx.env.data, params.username);
        } catch {
          const log = createLogMessage(ctx, {
            type: LogTypes.FAILED_SIGNUP,
            description: "Public signup is disabled",
          });

          await ctx.env.data.logs.create(client.tenant.id, log);

          return ctx.html(
            <EnterEmailPage
              vendorSettings={vendorSettings}
              loginSession={loginSession}
              error={i18next.t("user_account_does_not_exist")}
              email={params.username}
              client={client}
            />,
            400,
          );
        }
      }

      // Add the username to the state
      loginSession.authParams.username = params.username;
      loginSession.authParams.act_as = params.act_as;
      await env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        loginSession,
      );

      if (
        await usePasswordLogin(
          ctx,
          client,
          params.username,
          params.login_selection,
        )
      ) {
        return ctx.redirect(`/u/enter-password?state=${state}`);
      }

      let code_id = generateOTP();
      let existingCode = await env.data.codes.get(
        client.tenant.id,
        code_id,
        "otp",
      );

      // This is a slighly hacky way to ensure we don't generate a code that already exists
      while (existingCode) {
        code_id = generateOTP();
        existingCode = await env.data.codes.get(
          client.tenant.id,
          code_id,
          "otp",
        );
      }

      const createdCode = await ctx.env.data.codes.create(client.tenant.id, {
        code_id,
        code_type: "otp",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
      });

      const sendType = getSendParamFromAuth0ClientHeader(
        loginSession.auth0Client,
      );

      if (sendType === "link" && !params.username.includes("online.no")) {
        waitUntil(
          ctx,
          sendLink(
            ctx,
            params.username,
            createdCode.code_id,
            loginSession.authParams,
          ),
        );
      } else {
        waitUntil(ctx, sendCode(ctx, params.username, createdCode.code_id));
      }

      return ctx.redirect(`/u/enter-code?state=${state}`);
    },
  );
