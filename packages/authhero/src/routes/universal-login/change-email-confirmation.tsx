import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import { getAuthCookie } from "../../utils/cookies";
import MessagePage from "../../components/MessagePage";
import i18next from "i18next";
import ChangeEmailPage from "../../components/ChangeEmailPage";

export const changeEmailConfirmationRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/change-email-confirmation
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
        }),
      },
      responses: {
        200: {
          description: "HTML page showing email change confirmation",
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
      const { state, email } = ctx.req.valid("query");

      // Get theme and branding from initJSXRoute
      const { theme, branding, client } = await initJSXRoute(ctx, state, true);

      if (!client || !client.tenant?.id) {
        console.error(
          "Client or tenant ID missing in GET /u/change-email-confirmation after initJSXRoute",
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
        return ctx.redirect(`/u/login/identifier?state=${state}`);
      }

      return ctx.html(
        <ChangeEmailPage
          theme={theme}
          branding={branding}
          client={client}
          email={email}
          success={true}
          state={state}
        />,
      );
    },
  );
