import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRouteWithSession } from "./common";
import i18next from "i18next";
import ChangeEmailPage from "../../components/ChangeEmailPage";

export const changeEmailRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/change-email
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          client_id: z.string(),
          email: z.string().email(),
          change_id: z.string(),
        }),
      },
      responses: {
        200: {
          description: "Response",
        },
        302: {
          description: "Redirect to login if no session",
        },
        500: {
          description: "Server error",
        },
      },
    }),
    async (ctx) => {
      const { client_id, email, change_id } = ctx.req.valid("query");

      const { vendorSettings, client, user } = await initJSXRouteWithSession(
        ctx,
        client_id,
      );

      // Verify the change_id belongs to this user
      const changeRequest = await ctx.env.data.codes.get(
        client.tenant.id,
        change_id,
        "email_verification",
      );

      if (!changeRequest || changeRequest.user_id !== user.user_id) {
        return ctx.redirect(`/u/account?client_id=${client_id}`);
      }

      return ctx.html(
        <ChangeEmailPage
          vendorSettings={vendorSettings}
          client={client}
          email={email}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/change-email
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "post",
      path: "/",
      request: {
        query: z.object({
          client_id: z.string(),
          email: z.string().email(),
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
          description: "Response",
        },
        302: {
          description: "Redirect to account on success",
        },
        400: {
          description: "Bad request",
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { client_id, email, change_id } = ctx.req.valid("query");
      const { code } = ctx.req.valid("form");

      const { vendorSettings, client, user } = await initJSXRouteWithSession(
        ctx,
        client_id,
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
          error = i18next.t("invalid_request") || "Invalid request";
        } else if (changeRequest.user_id !== user.user_id) {
          error = i18next.t("invalid_request") || "Invalid request";
        } else if (changeRequest.used_at) {
          error = i18next.t("code_already_used") || "Code already used";
        } else if (new Date(changeRequest.expires_at) < new Date()) {
          error = i18next.t("code_expired") || "Code expired";
        } else {
          // Find the actual verification code
          const verificationCode = await env.data.codes.get(
            client.tenant.id,
            code,
            "email_verification",
          );

          if (!verificationCode) {
            error = i18next.t("invalid_code") || "Invalid code";
          } else if (verificationCode.used_at) {
            error = i18next.t("code_already_used") || "Code already used";
          } else if (new Date(verificationCode.expires_at) < new Date()) {
            error = i18next.t("code_expired") || "Code expired";
          } else if (verificationCode.user_id !== user.user_id) {
            error = i18next.t("invalid_code") || "Invalid code";
          } else {
            // Mark both codes as used
            await env.data.codes.used(client.tenant.id, change_id);
            await env.data.codes.used(client.tenant.id, code);

            // Update user's email and set it as verified
            await env.data.users.update(client.tenant.id, user.user_id, {
              email: email.toLowerCase(),
              email_verified: true,
            });

            // Return success message
            return ctx.html(
              <ChangeEmailPage
                vendorSettings={vendorSettings}
                client={client}
                email={email}
                success={true}
              />,
            );
          }
        }
      } catch (err) {
        error = i18next.t("operation_failed") || "Operation failed";
      }

      return ctx.html(
        <ChangeEmailPage
          vendorSettings={vendorSettings}
          client={client}
          email={email}
          error={error}
        />,
      );
    },
  );
