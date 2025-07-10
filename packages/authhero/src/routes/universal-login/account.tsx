import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import AccountPage from "../../components/AccountPage";
import { getAuthCookie } from "../../utils/cookies";
import MessagePage from "../../components/MessagePage";
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
          state: z.string(),
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
      const { env } = ctx;
      const { state } = ctx.req.valid("query");
      const { vendorSettings, client } = await initJSXRoute(ctx, state);

      if (!client || !client.tenant?.id) {
        return ctx.html(
          <MessagePage
            vendorSettings={vendorSettings}
            state={state}
            pageTitle={i18next.t("error_page_title") || "Error"}
            message={
              i18next.t("configuration_error_message") || "Configuration error"
            }
          />,
          500,
        );
      }

      // Get the current user session
      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );

      const authSession = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : null;

      if (!authSession) {
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

      return ctx.html(
        <AccountPage
          vendorSettings={vendorSettings}
          user={user}
          client={client}
          state={state}
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
          state: z.string(),
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
      const { state } = ctx.req.valid("query");
      const body = ctx.req.valid("form");
      const { vendorSettings, client } = await initJSXRoute(ctx, state);

      if (!client || !client.tenant?.id) {
        return ctx.html(
          <MessagePage
            vendorSettings={vendorSettings}
            state={state}
            pageTitle={i18next.t("error_page_title") || "Error"}
            message={
              i18next.t("configuration_error_message") || "Configuration error"
            }
          />,
          500,
        );
      }

      // Get the current user session
      const authCookie = getAuthCookie(
        client.tenant.id,
        ctx.req.header("cookie"),
      );

      const authSession = authCookie
        ? await env.data.sessions.get(client.tenant.id, authCookie)
        : null;

      if (!authSession) {
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

      const user = await env.data.users.get(
        client.tenant.id,
        authSession.user_id,
      );

      if (!user) {
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

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
        authSession.user_id,
      );

      return ctx.html(
        <AccountPage
          vendorSettings={vendorSettings}
          user={updatedUser || user}
          client={client}
          state={state}
          error={error}
          success={success}
        />,
      );
    },
  );
