import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRouteWithSession } from "./common";
import AccountPage from "../../components/AccountPage";
import i18next from "i18next";

export const accountRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/account
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          client_id: z.string(),
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
      const { client_id } = ctx.req.valid("query");

      const { vendorSettings, client, user } = await initJSXRouteWithSession(
        ctx,
        client_id,
      );

      return ctx.html(
        <AccountPage
          vendorSettings={vendorSettings}
          user={user}
          client={client}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/account
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "post",
      path: "/",
      request: {
        query: z.object({
          client_id: z.string(),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                email: z.string().email().optional(),
                action: z.enum(["update_email", "unlink_account"]),
                provider: z.string().optional(),
                user_id: z.string().optional(),
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
          description: "Redirect to login if no session",
        },
        400: {
          description: "Bad request",
        },
      },
    }),
    async (ctx) => {
      const { env } = ctx;
      const { client_id } = ctx.req.valid("query");
      const body = ctx.req.valid("form");

      const { vendorSettings, client, user } = await initJSXRouteWithSession(
        ctx,
        client_id,
      );

      let error: string | undefined;
      let success: string | undefined;

      try {
        if (body.action === "update_email" && body.email) {
          // Update the user's email
          await env.data.users.update(client.tenant.id, user.user_id, {
            email: body.email.toLowerCase(),
            email_verified: false, // New email needs verification
          });
          success =
            i18next.t("email_updated_successfully") ||
            "Email updated successfully";
        } else if (
          body.action === "unlink_account" &&
          body.provider &&
          body.user_id
        ) {
          // Unlink the social account
          await env.data.users.unlink(
            client.tenant.id,
            user.user_id,
            body.provider,
            body.user_id,
          );
          success =
            i18next.t("account_unlinked_successfully") ||
            "Account unlinked successfully";
        }
      } catch (err) {
        error = i18next.t("operation_failed") || "Operation failed";
      }

      // Get updated user data
      const updatedUser = await env.data.users.get(
        client.tenant.id,
        user.user_id,
      );

      return ctx.html(
        <AccountPage
          vendorSettings={vendorSettings}
          user={updatedUser || user}
          client={client}
          error={error}
          success={success}
        />,
      );
    },
  );
