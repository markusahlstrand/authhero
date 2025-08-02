import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import bcryptjs from "bcryptjs";
import i18next from "i18next";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import SignupPage from "../../components/SignUpPage";
import validatePasswordStrength from "../../utils/password";
import { getUserByProvider } from "../../helpers/users";
import { userIdGenerate } from "../../utils/user-id";
import MessagePage from "../../components/MessagePage";
import { sendValidateEmailAddress } from "../../emails";
import { passwordGrant } from "../../authentication-flows/password";
import { AuthError } from "../../types/AuthError";
import { createFrontChannelAuthResponse } from "../../authentication-flows/common";

export const signupRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/signup
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
          code: z.string().optional().openapi({
            description: "The code parameter from an email verification link",
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
      const { state, code } = ctx.req.valid("query");
      const { theme, branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

      const { username } = loginSession.authParams;

      if (!username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      if (code) {
        return ctx.html(
          <SignupPage
            state={state}
            theme={theme}
            branding={branding}
            client={client}
            email={username}
            code={code}
          />,
        );
      }

      return ctx.html(
        <SignupPage
          state={state}
          theme={theme}
          branding={branding}
          client={client}
          email={username}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/signup
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
                password: z.string(),
                "re-enter-password": z.string(),
                code: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description:
            "HTML page indicating success (e.g., email verification sent) or a next step.",
          content: { "text/html": { schema: z.string() } },
        },
        302: {
          description:
            "Redirect to continue the authentication flow (e.g., to client, MFA, consent) after successful login.",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description:
            "Bad Request - HTML page with an error message (e.g., passwords don't match, weak password, user exists).",
          content: { "text/html": { schema: z.string() } },
        },
        500: {
          description:
            "Internal Server Error - HTML page with an error message.",
          content: { "text/html": { schema: z.string() } },
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const loginParams = ctx.req.valid("form");
      const { env } = ctx;

      const { theme, branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

      try {
        if (!loginSession.authParams.username) {
          throw new HTTPException(400, { message: "Username required" });
        }

        const connection = "Username-Password-Authentication";
        ctx.set("connection", connection);

        if (loginParams.password !== loginParams["re-enter-password"]) {
          return ctx.html(
            <SignupPage
              state={state}
              code={loginParams.code}
              theme={theme}
              branding={branding}
              client={client}
              error={i18next.t("create_account_passwords_didnt_match")}
              email={loginSession.authParams.username}
            />,
            400,
          );
        }

        if (!validatePasswordStrength(loginParams.password)) {
          return ctx.html(
            <SignupPage
              state={state}
              code={loginParams.code}
              theme={theme}
              branding={branding}
              client={client}
              error={i18next.t("create_account_weak_password")}
              email={loginSession.authParams.username}
            />,
            400,
          );
        }

        const emailVerificationCode = loginParams.code
          ? await env.data.codes.get(
              client.tenant.id,
              loginParams.code,
              "email_verification",
            )
          : undefined;

        const emailVerificationSession = emailVerificationCode
          ? await env.data.loginSessions.get(
              client.tenant.id,
              emailVerificationCode.login_id,
            )
          : undefined;

        const existingUser = await getUserByProvider({
          userAdapter: ctx.env.data.users,
          tenant_id: client.tenant.id,
          username: loginSession.authParams.username,
          provider: "auth2",
        });

        if (existingUser) {
          return ctx.html(
            <SignupPage
              state={state}
              code={loginParams.code}
              theme={theme}
              branding={branding}
              client={client}
              error={i18next.t("user_exists_error")}
              email={loginSession.authParams.username}
            />,
            400,
          );
        }

        const email_verified =
          emailVerificationSession?.authParams.username ===
          loginSession.authParams.username;

        const user_id = `auth2|${userIdGenerate()}`;

        // This returns the primary user and not necessarily the one that is being created
        const newUser = await env.data.users.create(client.tenant.id, {
          user_id,
          email: loginSession.authParams.username,
          email_verified,
          provider: "auth2",
          connection,
          is_social: false,
        });

        await env.data.passwords.create(client.tenant.id, {
          user_id,
          password: await bcryptjs.hash(loginParams.password, 10),
          algorithm: "bcrypt",
        });

        if (!email_verified) {
          await sendValidateEmailAddress(ctx, newUser);

          return ctx.html(
            <MessagePage
              message={i18next.t("validate_email_body")}
              pageTitle={i18next.t("validate_email_title")}
              theme={theme}
              branding={branding}
              client={client}
              state={state}
            />,
          );
        }

        const loginResult = await passwordGrant(
          ctx,
          client,
          {
            ...loginSession.authParams,
            password: loginParams.password,
          },
          loginSession,
        );

        return createFrontChannelAuthResponse(ctx, loginResult);
      } catch (err: unknown) {
        let errorMessage = i18next.t("unknown_error_message");
        let errorStatus: 400 | 500 = 400;

        if (err instanceof HTTPException) {
          errorMessage = err.message || errorMessage;
          errorStatus = err.status === 400 ? 400 : 500;
        } else if (err instanceof AuthError) {
          errorMessage = err.message || errorMessage;
          // AuthError might have more specific status, but for signup page, 400 is usually appropriate
        } else if (err instanceof Error) {
          errorMessage = err.message || errorMessage;
          errorStatus = 500; // Default to 500 for generic errors
        }

        return ctx.html(
          <SignupPage
            state={state}
            theme={theme}
            branding={branding}
            client={client}
            error={errorMessage}
            email={loginSession.authParams.username}
            code={loginParams.code}
          />,
          errorStatus,
        );
      }
    },
  );
