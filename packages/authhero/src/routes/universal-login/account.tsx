import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRouteWithSession } from "./common";
import AccountPage from "../../components/AccountPage";
import MessagePage from "../../components/MessagePage";
import i18next from "i18next";
import { nanoid } from "nanoid";

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
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
      },
      responses: {
        200: {
          description: "HTML page showing account management interface.",
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

      // Get theme, branding and user from initJSXRoute
      // Pass continuationScope to allow mid-login access
      const { theme, branding, client, user, loginSession } =
        await initJSXRouteWithSession(ctx, state, {
          continuationScope: "account",
        });

      if (!client || !client.tenant?.id) {
        console.error(
          "Client or tenant ID missing in GET /u/account after initJSXRoute",
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

      // Generate CSRF token and store in session
      const csrfToken = nanoid();
      await env.data.loginSessions.update(client.tenant.id, loginSession.id, {
        csrf_token: csrfToken,
      });

      return ctx.html(
        <AccountPage
          theme={theme}
          branding={branding}
          user={user}
          client={client}
          state={state}
          csrfToken={csrfToken}
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
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                action: z.enum(["unlink_account"]),
                provider: z.string().optional(),
                user_id: z.string().optional(),
                csrf_token: z.string().optional(),
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
      const body = ctx.req.valid("form");

      // Get theme, branding and user from initJSXRoute
      // Pass continuationScope to allow mid-login access
      const { theme, branding, client, user, loginSession } =
        await initJSXRouteWithSession(ctx, state, {
          continuationScope: "account",
        });

      let error: string | undefined;
      let success: string | undefined;

      try {
        if (body.action === "unlink_account" && body.provider && body.user_id) {
          // Validate CSRF token
          if (!body.csrf_token || body.csrf_token !== loginSession.csrf_token) {
            throw new Error("Invalid CSRF token");
          }

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

      // Generate new CSRF token for the next request
      const csrfToken = nanoid();
      await env.data.loginSessions.update(client.tenant.id, loginSession.id, {
        csrf_token: csrfToken,
      });

      return ctx.html(
        <AccountPage
          theme={theme}
          branding={branding}
          user={updatedUser || user}
          client={client}
          error={error}
          success={success}
          state={state}
          csrfToken={csrfToken}
        />,
      );
    },
  );
