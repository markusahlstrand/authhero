import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import bcryptjs from "bcryptjs";
import { LogTypes } from "@authhero/adapter-interfaces";
import i18next from "i18next";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import ResetPasswordPage from "../../components/ResetPasswordPage";
import ResetPasswordForm from "../../components/ResetPasswordForm";
import AuthLayout from "../../components/AuthLayout";
import MessagePage from "../../components/MessagePage";
import validatePasswordStrength from "../../utils/password";
import { getUserByProvider } from "../../helpers/users";
import { logMessage } from "../../helpers/logging";

export const resetPasswordRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/reset-password
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
          code: z.string().openapi({
            description: "The code parameter from the authorization request",
          }),
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

      const { theme, branding, client, loginSession, useShadcn } =
        await initJSXRoute(ctx, state);

      if (!loginSession.authParams.username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      if (useShadcn) {
        return ctx.html(
          <AuthLayout
            title={i18next.t("reset_password_title", "Reset Password")}
            theme={theme}
            branding={branding}
            client={client}
          >
            <ResetPasswordForm
              theme={theme}
              branding={branding}
              loginSession={loginSession}
              email={loginSession.authParams.username}
              client={client}
            />
          </AuthLayout>,
        );
      }

      return ctx.html(
        <ResetPasswordPage
          theme={theme}
          branding={branding}
          client={client}
          email={loginSession.authParams.username}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/reset-password
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
          code: z.string().openapi({
            description: "The code parameter from the authorization request",
          }),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                password: z.string(),
                "re-enter-password": z.string(),
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
      const { state, code } = ctx.req.valid("query");
      const { password, "re-enter-password": reEnterPassword } =
        ctx.req.valid("form");

      const { env } = ctx;

      const { theme, branding, client, loginSession, useShadcn } =
        await initJSXRoute(ctx, state);

      if (!loginSession.authParams.username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      if (password !== reEnterPassword) {
        if (useShadcn) {
          return ctx.html(
            <AuthLayout
              title={i18next.t("reset_password_title", "Reset Password")}
              theme={theme}
              branding={branding}
              client={client}
            >
              <ResetPasswordForm
                error={i18next.t("create_account_passwords_didnt_match")}
                theme={theme}
                branding={branding}
                loginSession={loginSession}
                email={loginSession.authParams.username}
                client={client}
              />
            </AuthLayout>,
            400,
          );
        }

        return ctx.html(
          <ResetPasswordPage
            error={i18next.t("create_account_passwords_didnt_match")}
            theme={theme}
            branding={branding}
            client={client}
            email={loginSession.authParams.username}
          />,
          400,
        );
      }

      if (!validatePasswordStrength(password)) {
        if (useShadcn) {
          return ctx.html(
            <AuthLayout
              title={i18next.t("reset_password_title", "Reset Password")}
              theme={theme}
              branding={branding}
              client={client}
            >
              <ResetPasswordForm
                error={i18next.t("create_account_weak_password")}
                theme={theme}
                branding={branding}
                loginSession={loginSession}
                email={loginSession.authParams.username}
                client={client}
              />
            </AuthLayout>,
            400,
          );
        }

        return ctx.html(
          <ResetPasswordPage
            error={i18next.t("create_account_weak_password")}
            theme={theme}
            branding={branding}
            client={client}
            email={loginSession.authParams.username}
          />,
          400,
        );
      }

      // Note! we don't use the primary user here. Something to be careful of
      // this means the primary user could have a totally different email address
      const user = await getUserByProvider({
        userAdapter: env.data.users,
        tenant_id: client.tenant.id,
        username: loginSession.authParams.username,
        provider: "auth2",
      });

      if (!user) {
        throw new HTTPException(400, { message: "User not found" });
      }

      try {
        const foundCode = await env.data.codes.get(
          client.tenant.id,
          code,
          "password_reset",
        );

        if (!foundCode) {
          // surely we should check this on the GET rather than have the user waste time entering a new password?
          // THEN we can assume here it works and throw a hono exception if it doesn't... because it's an issue with our system
          // ALTHOUGH the user could have taken a long time to enter the password...
          if (useShadcn) {
            return ctx.html(
              <AuthLayout
                title={i18next.t("reset_password_title", "Reset Password")}
                theme={theme}
                branding={branding}
                client={client}
              >
                <ResetPasswordForm
                  error="Code not found or expired"
                  theme={theme}
                  branding={branding}
                  loginSession={loginSession}
                  email={loginSession.authParams.username}
                  client={client}
                />
              </AuthLayout>,
              400,
            );
          }

          return ctx.html(
            <ResetPasswordPage
              error="Code not found or expired"
              theme={theme}
              branding={branding}
              client={client}
              email={loginSession.authParams.username}
            />,
            400,
          );
        }

        // Mark old password as not current (for password history)
        const existingPassword = await env.data.passwords.get(
          client.tenant.id,
          user.user_id,
        );
        if (existingPassword) {
          await env.data.passwords.update(client.tenant.id, {
            id: existingPassword.id,
            user_id: user.user_id,
            password: existingPassword.password,
            algorithm: existingPassword.algorithm,
            is_current: false,
          });
        }

        // Create new password
        await env.data.passwords.create(client.tenant.id, {
          user_id: user.user_id,
          password: await bcryptjs.hash(password, 10),
          algorithm: "bcrypt",
          is_current: true,
        });

        if (!user.email_verified) {
          await env.data.users.update(client.tenant.id, user.user_id, {
            email_verified: true,
          });
        }

        // Log the successful password change
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.SUCCESS_CHANGE_PASSWORD,
          description: `Password changed for ${user.email}`,
          userId: user.user_id,
        });
      } catch {
        // seems like we should not do this catch... try and see what happens
        if (useShadcn) {
          return ctx.html(
            <AuthLayout
              title={i18next.t("reset_password_title", "Reset Password")}
              theme={theme}
              branding={branding}
              client={client}
            >
              <ResetPasswordForm
                error="The password could not be reset"
                theme={theme}
                branding={branding}
                loginSession={loginSession}
                email={loginSession.authParams.username}
                client={client}
              />
            </AuthLayout>,
            400,
          );
        }

        return ctx.html(
          <ResetPasswordPage
            error="The password could not be reset"
            theme={theme}
            branding={branding}
            client={client}
            email={loginSession.authParams.username}
          />,
          400,
        );
      }

      return ctx.html(
        <MessagePage
          message={i18next.t("password_has_been_reset")}
          theme={theme}
          branding={branding}
          client={client}
          state={state}
        />,
      );
    },
  );
