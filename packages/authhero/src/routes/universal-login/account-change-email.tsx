import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import AccountChangeEmailPage from "../../components/AccountChangeEmailPage";
import { getAuthCookie } from "../../utils/cookies";
import MessagePage from "../../components/MessagePage";
import i18next from "i18next";
import { sendCode } from "../../emails";
import generateOTP from "../../utils/otp";
import { nanoid } from "nanoid";
import { EMAIL_VERIFICATION_EXPIRATION_TIME } from "../../constants";

export const accountChangeEmailRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/account/change-email
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
        }),
      },
      responses: {
        200: {
          description: "HTML page showing email change interface.",
          content: { "text/html": { schema: z.string() } },
        },
        302: {
          description: "Redirect to login if no session",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description:
            "Bad Request - HTML error page if state is missing or other input error.",
          content: { "text/html": { schema: z.string() } },
        },
        500: {
          description: "Internal Server Error - HTML error page.",
          content: { "text/html": { schema: z.string() } },
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { state } = ctx.req.valid("query");

      // Get theme and branding from initJSXRoute
      const { theme, branding, client } = await initJSXRoute(ctx, state, true);

      if (!client || !client.tenant?.id) {
        console.error(
          "Client or tenant ID missing in GET /u/account/change-email after initJSXRoute",
        );
        return ctx.html(
          <MessagePage
            theme={theme}
            branding={branding}
            client={client}
            state={state}
            pageTitle={i18next.t("error_page_title") || "Error"}
            message={
              i18next.t("configuration_error_message") ||
              "A configuration error occurred."
            }
          />,
          500,
        );
      }

      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );

      const authSession = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : null;

      if (!authSession) {
        return ctx.redirect(
          `/u/login/identifier?state=${encodeURIComponent(state)}`,
        );
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(
          `/u/login/identifier?state=${encodeURIComponent(state)}`,
        );
      }

      return ctx.html(
        <AccountChangeEmailPage
          theme={theme}
          branding={branding}
          user={user}
          client={client}
          state={state}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/account/change-email
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
                email: z.string().toLowerCase(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "HTML response with form results",
          content: { "text/html": { schema: z.string() } },
        },
        302: {
          description: "Redirect to change-email verification page",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description:
            "Bad Request - HTML error page if state is missing or other input error.",
          content: { "text/html": { schema: z.string() } },
        },
        500: {
          description: "Internal Server Error - HTML error page.",
          content: { "text/html": { schema: z.string() } },
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { state } = ctx.req.valid("query");
      const { email } = ctx.req.valid("form");

      // Get theme and branding from initJSXRoute
      const { theme, branding, client } = await initJSXRoute(ctx, state, true);

      if (!client || !client.tenant?.id) {
        console.error(
          "Client or tenant ID missing in POST /u/account/change-email after initJSXRoute",
        );
        return ctx.html(
          <MessagePage
            theme={theme}
            branding={branding}
            client={client}
            state={state}
            pageTitle={i18next.t("error_page_title") || "Error"}
            message={
              i18next.t("configuration_error_message") ||
              "A configuration error occurred."
            }
          />,
          500,
        );
      }

      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );

      const authSession = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : null;

      if (!authSession) {
        return ctx.redirect(
          `/u/login/identifier?state=${encodeURIComponent(state)}`,
        );
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(
          `/u/login/identifier?state=${encodeURIComponent(state)}`,
        );
      }

      // Check if email is already taken by checking existing users
      const existingUsers = await env.data.users.list(client.tenant.id, {
        page: 1,
        per_page: 1,
        include_totals: false,
        q: `email:"${email}"`,
      });

      if (
        existingUsers.users.length > 0 &&
        existingUsers.users[0]?.user_id !== user.user_id
      ) {
        return ctx.html(
          <AccountChangeEmailPage
            theme={theme}
            branding={branding}
            user={user}
            client={client}
            state={state}
            error={i18next.t("email_already_taken") || "Email is already taken"}
          />,
        );
      }

      // If email is the same as current, show error
      if (email === user.email) {
        return ctx.html(
          <AccountChangeEmailPage
            theme={theme}
            branding={branding}
            user={user}
            client={client}
            state={state}
            error={
              i18next.t("email_same_as_current") || "This is your current email"
            }
          />,
        );
      }

      // Generate verification code and create change request (reusing existing pattern)
      const code = generateOTP();
      const changeId = nanoid();

      // Create the change request entry using the codes system
      await env.data.codes.create(client.tenant.id, {
        code_id: changeId,
        login_id: "", // Not using login session for this flow
        code_type: "email_verification",
        expires_at: new Date(
          Date.now() + EMAIL_VERIFICATION_EXPIRATION_TIME,
        ).toISOString(),
        user_id: user.user_id,
      });

      // Create the verification code entry
      await env.data.codes.create(client.tenant.id, {
        code_id: code,
        login_id: "", // Not using login session for this flow
        code_type: "email_verification",
        expires_at: new Date(
          Date.now() + EMAIL_VERIFICATION_EXPIRATION_TIME,
        ).toISOString(),
        user_id: user.user_id,
      });

      // Send verification email
      await sendCode(ctx, {
        to: email,
        code,
      });

      // Redirect to verification page
      return ctx.redirect(
        `/u/change-email-verify?state=${encodeURIComponent(state)}&email=${encodeURIComponent(email)}&change_id=${changeId}`,
      );
    },
  );
