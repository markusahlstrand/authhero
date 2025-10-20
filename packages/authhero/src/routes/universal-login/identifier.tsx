import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute, usePasswordLogin } from "./common";
import IdentifierForm from "../../components/IdentifierForm";
import IdentifierPage from "../../components/IdentifierPage";
import AuthLayout from "../../components/AuthLayout";
import { getPrimaryUserByProvider } from "../../helpers/users";
import { preUserSignupHook } from "../../hooks";
import { createLogMessage } from "../../utils/create-log-message";
import { LogTypes } from "@authhero/adapter-interfaces";
import i18next from "i18next";
import generateOTP from "../../utils/otp";
import { sendCode, sendLink } from "../../emails";
import { OTP_EXPIRATION_TIME } from "../../constants";
import { getConnectionFromIdentifier } from "../../utils/username";
import { HTTPException } from "hono/http-exception";
import { waitUntil } from "../../helpers/wait-until";

export type SendType = "link" | "code";

export const identifierRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/login/identifier
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
      const { state } = ctx.req.valid("query");

      const { theme, branding, loginSession, client, useShadcn } =
        await initJSXRoute(ctx, state);

      // Use shadcn style if useShadcn is true
      if (useShadcn) {
        return ctx.html(
          <AuthLayout
            title={i18next.t("welcome", "Login")}
            theme={theme}
            branding={branding}
            client={client}
          >
            <IdentifierForm
              theme={theme}
              branding={branding}
              loginSession={loginSession}
              client={client}
              email={loginSession.authParams.username}
            />
          </AuthLayout>,
        );
      }

      // Classic style (default)
      return ctx.html(
        <IdentifierPage
          theme={theme}
          branding={branding}
          loginSession={loginSession}
          client={client}
          email={loginSession.authParams.username}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/login/identifier
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
          style: z.enum(["classic", "shadcn"]).optional().openapi({
            description: "UI style to use for the login page",
          }),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                username: z.string().transform((u) => u.toLowerCase()),
                login_selection: z.enum(["code", "password"]).optional(),
              }),
            },
          },
        },
      },
      responses: {
        400: {
          description: "Error response",
        },
        302: {
          description: "Redirect to enter code or password",
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { state } = ctx.req.valid("query");
      const params = ctx.req.valid("form");
      ctx.set("body", params);
      ctx.set("username", params.username);

      const { client, loginSession, theme, branding, useShadcn } =
        await initJSXRoute(ctx, state);
      ctx.set("client_id", client.client_id);

      const countryCode = ctx.get("countryCode");
      // Note: country code not available in theme or branding schema yet
      const vendorCountryCode = undefined; // Could add to theme.widget or branding later

      const { normalized: username, connectionType } =
        getConnectionFromIdentifier(
          params.username,
          vendorCountryCode || countryCode,
        );

      if (
        !client.connections.find((c) => c.strategy === connectionType) ||
        !username
      ) {
        if (useShadcn) {
          return ctx.html(
            <AuthLayout
              title={i18next.t("welcome", "Login")}
              theme={theme}
              branding={branding}
              client={client}
            >
              <IdentifierForm
                theme={theme}
                branding={branding}
                loginSession={loginSession}
                error={i18next.t("invalid_identifier")}
                email={params.username}
                client={client}
              />
            </AuthLayout>,
            400,
          );
        }

        return ctx.html(
          <IdentifierPage
            theme={theme}
            branding={branding}
            loginSession={loginSession}
            error={i18next.t("invalid_identifier")}
            email={params.username}
            client={client}
          />,
          400,
        );
      }

      const user = await getPrimaryUserByProvider({
        userAdapter: env.data.users,
        tenant_id: client.tenant.id,
        username,
        provider: connectionType,
      });
      if (user) {
        ctx.set("user_id", user.user_id);
      }

      if (!user) {
        try {
          await preUserSignupHook(ctx, client, ctx.env.data, username);
        } catch {
          const log = createLogMessage(ctx, {
            type: LogTypes.FAILED_SIGNUP,
            description: "Public signup is disabled",
          });

          waitUntil(ctx, ctx.env.data.logs.create(client.tenant.id, log));

          if (useShadcn) {
            return ctx.html(
              <AuthLayout
                title={i18next.t("welcome", "Login")}
                theme={theme}
                branding={branding}
                client={client}
              >
                <IdentifierForm
                  theme={theme}
                  branding={branding}
                  loginSession={loginSession}
                  error={i18next.t("user_account_does_not_exist")}
                  email={params.username}
                  client={client}
                />
              </AuthLayout>,
              400,
            );
          }

          return ctx.html(
            <IdentifierPage
              theme={theme}
              branding={branding}
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
      loginSession.authParams.username = username;
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
        redirect_uri: loginSession.authParams.redirect_uri,
      });

      const connection = client.connections.find(
        (p) => p.strategy === connectionType,
      );

      if (!connection) {
        throw new HTTPException(400, {
          message: i18next.t("connection_not_found", {
            connection: connectionType,
          }),
        });
      }

      // Extract language from ui_locales
      const language = loginSession.authParams.ui_locales
        ?.split(" ")
        .map((locale) => locale.split("-")[0])[0];

      if (
        connectionType === "email" &&
        // This is different to how it works in auth0
        connection.options.authentication_method === "magic_link"
      ) {
        await sendLink(ctx, {
          to: username,
          code: createdCode.code_id,
          authParams: loginSession.authParams,
          language,
        });
      } else {
        await sendCode(ctx, {
          to: username,
          code: createdCode.code_id,
          language,
        });
      }

      return ctx.redirect(`/u/enter-code?state=${state}`);
    },
  );
