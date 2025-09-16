import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRouteWithSession } from "./common";
import MessagePage from "../../components/MessagePage";
import i18next from "i18next";
import ChangeEmailPage from "../../components/ChangeEmailPage";

export const changeEmailConfirmationRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/account/change-email-confirmation
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
      const { state, email } = ctx.req.valid("query");

      // Get theme, branding and user from initJSXRoute
      const { theme, branding, client, loginSession } =
        await initJSXRouteWithSession(ctx, state);

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

      // Check if the authorization_url contains screen_hint=change-email
      let redirectUrl = `/u/account?state=${encodeURIComponent(state)}`;

      if (loginSession?.authorization_url) {
        const authUrl = new URL(loginSession.authorization_url);
        if (authUrl.searchParams.get("screen_hint") === "change-email") {
          // User came directly to change-email, redirect to original redirect_uri
          redirectUrl = loginSession.authParams?.redirect_uri || redirectUrl;
        }
      }

      return ctx.html(
        <ChangeEmailPage
          theme={theme}
          branding={branding}
          client={client}
          email={email}
          success={true}
          state={state}
          redirectUrl={redirectUrl}
        />,
      );
    },
  );
