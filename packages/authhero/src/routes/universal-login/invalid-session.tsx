import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import InvalidSessionPage from "../../components/InvalidSessionPage";

export const invalidSessionRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/invalid-session
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
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const { theme, branding, loginSession } = await initJSXRoute(ctx, state);

      let redirectUrl: URL | undefined;

      if (
        loginSession.authParams.redirect_uri &&
        loginSession.authParams.state
      ) {
        redirectUrl = new URL(loginSession.authParams.redirect_uri);
        redirectUrl.searchParams.set("state", loginSession.authParams.state);
        redirectUrl.searchParams.set("error", "invalid_session");
        redirectUrl.searchParams.set(
          "error_description",
          loginSession.authParams.username || "",
        );
      }

      return ctx.html(
        <InvalidSessionPage
          redirectUrl={redirectUrl?.href}
          theme={theme}
          branding={branding}
        />,
      );
    },
  );
