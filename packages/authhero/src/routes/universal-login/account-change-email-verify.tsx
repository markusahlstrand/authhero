import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRouteWithSession } from "./common";
import i18next from "i18next";
import ChangeEmailPage from "../../components/ChangeEmailPage";

export const changeEmailVerifyRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/account/change-email-verify
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
          email: z.string().email(),
          change_id: z.string(),
        }),
      },
      responses: {
        200: {
          description: "HTML page for email change verification",
          content: { "text/html": { schema: z.string() } },
        },
        302: {
          description: "Redirect to account or login if no session",
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
      const { state, email, change_id } = ctx.req.valid("query");

      // Get theme, branding and user from initJSXRoute
      const { theme, branding, client, user } = await initJSXRouteWithSession(
        ctx,
        state,
      );

      // Verify the change_id belongs to this user
      const changeRequest = await ctx.env.data.codes.get(
        client.tenant.id,
        change_id,
        "email_verification",
      );

      if (!changeRequest || changeRequest.user_id !== user.user_id) {
        return ctx.redirect(`/u/account?state=${state}`);
      }

      return ctx.html(
        <ChangeEmailPage
          theme={theme}
          branding={branding}
          client={client}
          email={email}
          state={state}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/change-email-verify
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
          email: z.string().toLowerCase(),
          change_id: z.string(),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                code: z.string(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "HTML response with verification result",
          content: { "text/html": { schema: z.string() } },
        },
        302: {
          description: "Redirect to confirmation page on success",
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
      const { state, email, change_id } = ctx.req.valid("query");
      const { code } = ctx.req.valid("form");

      // Get theme, branding and user from initJSXRoute
      const { theme, branding, client, user } = await initJSXRouteWithSession(
        ctx,
        state,
      );

      let error: string | undefined;

      try {
        // Find the change request
        const changeRequest = await env.data.codes.get(
          client.tenant.id,
          change_id,
          "email_verification",
        );

        if (!changeRequest) {
          error = i18next.t("invalid_request");
        } else if (changeRequest.user_id !== user.user_id) {
          error = i18next.t("invalid_request");
        } else if (changeRequest.used_at) {
          error = i18next.t("code_already_used");
        } else if (new Date(changeRequest.expires_at) < new Date()) {
          error = i18next.t("code_expired");
        } else {
          // Find the actual verification code
          const verificationCode = await env.data.codes.get(
            client.tenant.id,
            code,
            "email_verification",
          );

          if (!verificationCode) {
            error = i18next.t("invalid_code");
          } else if (verificationCode.used_at) {
            error = i18next.t("code_already_used");
          } else if (new Date(verificationCode.expires_at) < new Date()) {
            error = i18next.t("code_expired");
          } else if (verificationCode.user_id !== user.user_id) {
            error = i18next.t("invalid_code");
          } else {
            // Mark both codes as used
            await env.data.codes.used(client.tenant.id, change_id);
            await env.data.codes.used(client.tenant.id, code);

            // Update user's email and set it as verified
            await env.data.users.update(client.tenant.id, user.user_id, {
              email,
              email_verified: true,
            });

            // Redirect to confirmation page
            return ctx.redirect(
              `/u/change-email-confirmation?state=${encodeURIComponent(state)}&email=${encodeURIComponent(email)}`,
            );
          }
        }
      } catch (err) {
        error = i18next.t("operation_failed");
      }

      return ctx.html(
        <ChangeEmailPage
          theme={theme}
          branding={branding}
          client={client}
          email={email}
          error={error}
          state={state}
        />,
      );
    },
  );
