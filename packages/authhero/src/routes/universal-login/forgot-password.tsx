import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import ForgotPasswordPage from "../../components/ForgotPasswordPage";
import ForgotPasswordForm from "../../components/ForgotPasswordForm";
import ForgotPasswordSentPage from "../../components/ForgotPasswordSentPage";
import AuthLayout from "../../components/AuthLayout";
import i18next from "i18next";
import { requestPasswordReset } from "../../authentication-flows/password";

export const forgotPasswordRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/forgot-password
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
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");

      const { theme, branding, client, loginSession, useShadcn } =
        await initJSXRoute(ctx, state);

      if (useShadcn) {
        return ctx.html(
          <AuthLayout
            title={i18next.t("forgot_password_title", "Forgot Password")}
            theme={theme}
            branding={branding}
            client={client}
          >
            <ForgotPasswordForm
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
        <ForgotPasswordPage
          theme={theme}
          branding={branding}
          client={client}
          state={state}
          email={loginSession.authParams.username}
        />,
      );
    },
  )
  // -------------------------------
  // POST /u/forgot-password
  // -------------------------------
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
      },
      responses: {
        200: {
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");

      const { theme, branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

      await requestPasswordReset(
        ctx,
        client,
        loginSession.authParams.username!,
        loginSession.id,
      );

      return ctx.html(
        <ForgotPasswordSentPage
          theme={theme}
          branding={branding}
          client={client}
          state={state}
        />,
      );
    },
  );
