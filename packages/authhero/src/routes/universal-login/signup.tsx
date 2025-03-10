import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import bcryptjs from "bcryptjs";
import i18next from "i18next";
import { Bindings, Variables } from "../../types";
import { fetchVendorSettings, initJSXRoute } from "./common";
import SignupPage from "../../components/SignUpPage";
import validatePasswordStrength from "../../utils/password";
import { getUserByEmailAndProvider } from "../../helpers/users";
import { userIdGenerate } from "../../utils/user-id";
import MessagePage from "../../components/Message";
import { sendValidateEmailAddress } from "../../emails";
import { loginWithPassword } from "../../authentication-flows/password";
import { getDataAdapter } from "../../helpers/data";

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
      const { vendorSettings, session } = await initJSXRoute(ctx, state);

      const { username } = session.authParams;

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
          description: "Response",
        },
      },
    }),
    //TODO: merge logic with dbconnections/signup
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const loginParams = ctx.req.valid("form");
      const { env } = ctx;

      const { vendorSettings, client, session } = await initJSXRoute(
        ctx,
        state,
      );

      const connection = "Username-Password-Authentication";
      ctx.set("client_id", client.id);
      ctx.set("connection", connection);

      const email = session.authParams.username;
      if (!email) {
        throw new HTTPException(400, { message: "Username required" });
      }

      if (loginParams.password !== loginParams["re-enter-password"]) {
        return ctx.html(
          <SignupPage
            state={state}
            code={loginParams.code}
            vendorSettings={vendorSettings}
            error={i18next.t("create_account_passwords_didnt_match")}
            email={session.authParams.username}
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
            email={session.authParams.username}
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

      try {
        const existingUser = await getUserByEmailAndProvider({
          userAdapter: ctx.env.data.users,
          tenant_id: client.tenant.id,
          email,
          provider: "auth2",
        });

        if (existingUser) {
          throw new HTTPException(400, { message: "Invalid sign up" });
        }

        const email_verified =
          emailVerificationSession?.authParams.username === email;

        const newUser = await getDataAdapter(ctx).users.create(
          client.tenant.id,
          {
            user_id: `auth2|${userIdGenerate()}`,
            email,
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

        return await loginWithPassword(
          ctx,
          client,
          {
            ...session.authParams,
            password: loginParams.password,
          },
          session,
        );
      } catch (err: unknown) {
        const vendorSettings = await fetchVendorSettings(
          env,
          client.id,
          session.authParams.vendor_id,
        );

        const error = err as Error;
        return ctx.html(
          <SignupPage
            state={state}
            vendorSettings={vendorSettings}
            error={error.message}
            email={email}
          />,
          400,
        );
      }
    },
  );
