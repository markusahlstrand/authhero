import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { fetchVendorSettings } from "./common";
import MessagePage from "../../components/MessagePage";

export const infoRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/info
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
          code: z.string().openapi({
            description: "The code parameter from the authorization request",
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
      const vendorSettings = await fetchVendorSettings(ctx.env);
      const { state } = ctx.req.valid("query");

      return ctx.html(
        <MessagePage
          message="Not implemented"
          pageTitle="User info"
          vendorSettings={vendorSettings}
          state={state}
        />,
      );
    },
  );
