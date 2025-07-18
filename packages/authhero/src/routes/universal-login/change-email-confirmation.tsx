import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRouteWithSession } from "./common";
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
          client_id: z.string(),
          email: z.string().email(),
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
      const { client_id, email } = ctx.req.valid("query");

      const { vendorSettings, client } = await initJSXRouteWithSession(
        ctx,
        client_id,
      );

      return ctx.html(
        <ChangeEmailPage
          vendorSettings={vendorSettings}
          client={client}
          email={email}
          success={true}
        />,
      );
    },
  );
