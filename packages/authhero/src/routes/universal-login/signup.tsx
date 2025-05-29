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
import { loginWithPassword } from "../../authentication-flows/password";
import { getDataAdapter } from "../../helpers/data";
import { AuthError } from "../../types/AuthError"; // Ensure AuthError is imported

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
      const { vendorSettings, loginSession } = await initJSXRoute(ctx, state);

      const { username } = loginSession.authParams;

      if (!username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      if (code) {
        return ctx.html(
          <SignupPage
            state={state}
            vendorSettings={vendorSettings}
            email={username}
            code={code}
          />,
        );
      }

      return ctx.html(
        <SignupPage
          state={state}
          vendorSettings={vendorSettings}
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
    //TODO: merge logic with dbconnections/signup
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const loginParams = ctx.req.valid("form");
      const { env } = ctx;

      // These are declared here so they are available in the catch block's scope
      let vendorSettings;
      let client;
      let loginSession;
      let username;

      try {
        ({ vendorSettings, client, loginSession } = await initJSXRoute(
          ctx,
          state,
        ));

        const connection = "Username-Password-Authentication";
        ctx.set("client_id", client.id);
        ctx.set("connection", connection);

        ({ username } = loginSession.authParams);
        if (!username) {
          // This case should ideally be caught by initJSXRoute or earlier validation
          // but as a safeguard:
          return ctx.html(
            <MessagePage
              vendorSettings={vendorSettings} // vendorSettings should be available
              state={state}
              pageTitle={i18next.t("error_page_title") || "Error"}
              message={
                i18next.t("username_required_error") || "Username required"
              }
            />,
            400,
          );
        }

        if (loginParams.password !== loginParams["re-enter-password"]) {
          return ctx.html(
            <SignupPage
              state={state}
              code={loginParams.code}
              vendorSettings={vendorSettings}
              error={i18next.t("create_account_passwords_didnt_match")}
              email={username}
            />,
            400,
          );
        }

        if (!validatePasswordStrength(loginParams.password)) {
          return ctx.html(
            <SignupPage
              state={state}
              code={loginParams.code}
              vendorSettings={vendorSettings}
              error={i18next.t("create_account_weak_password")}
              email={username}
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
          username: username,
          provider: "auth2",
        });

        if (existingUser) {
          return ctx.html(
            <SignupPage
              state={state}
              code={loginParams.code}
              vendorSettings={vendorSettings}
              error={i18next.t("user_exists_error") || "User already exists"} // Provide a fallback translation key
              email={username}
            />,
            400,
          );
        }

        const email_verified =
          emailVerificationSession?.authParams.username === username;

        const newUser = await getDataAdapter(ctx).users.create(
          client.tenant.id,
          {
            user_id: `auth2|${userIdGenerate()}`,
            email: username,
            email_verified,
            provider: "auth2",
            connection,
            is_social: false,
          },
        );

        await env.data.passwords.create(client.tenant.id, {
          user_id: newUser.user_id,
          password: await bcryptjs.hash(loginParams.password, 10),
          algorithm: "bcrypt",
        });

        if (!email_verified) {
          await sendValidateEmailAddress(ctx, newUser);

          return ctx.html(
            <MessagePage
              message={i18next.t("validate_email_body")}
              pageTitle={i18next.t("validate_email_title")}
              vendorSettings={vendorSettings}
              state={state}
            />,
          );
        }

        const loginResult = await loginWithPassword(
          ctx,
          client,
          {
            ...loginSession.authParams,
            password: loginParams.password,
          },
          loginSession,
        );

        if (loginResult instanceof Response) {
          return loginResult;
        } else {
          // loginResult is TokenResponse - this is unexpected for this HTML route
          console.error(
            "Unexpected TokenResponse in POST /u/signup after login. This might indicate a flow misconfiguration as this route expects HTML or redirect.",
            loginResult,
          );
          return ctx.html(
            <MessagePage
              vendorSettings={vendorSettings}
              state={state}
              pageTitle={i18next.t("error_page_title") || "Error"}
              message={
                i18next.t("unexpected_error_try_again") ||
                "An unexpected error occurred. Please try again."
              }
            />,
            500,
          );
        }
      } catch (err: unknown) {
        let errorMessage =
          i18next.t("unknown_error_message") || "An unknown error occurred.";
        let errorStatus: 400 | 500 = 400;

        if (err instanceof HTTPException) {
          errorMessage = err.message || errorMessage;
          errorStatus = err.status === 400 ? 400 : 500; // Only allow 400 or 500 from HTTPException
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
            vendorSettings={vendorSettings}
            error={errorMessage}
            email={username}
            code={loginParams.code}
          />,
          errorStatus,
        );
      }
    },
  );
