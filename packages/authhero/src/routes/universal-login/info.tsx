import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import MessagePage from "../../components/MessagePage";
import { defineRoute } from "../../utils/define-route";
const getRoot = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
      const { state } = ctx.req.valid("query");
      const { theme, branding, client } = await initJSXRoute(ctx, state);

      return ctx.html(
        <MessagePage
          message="Not implemented"
          pageTitle="User info"
          theme={theme}
          branding={branding}
          client={client}
          state={state}
        />,
      );
    },
});


export const infoRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  .openapiRoutes([getRoot] as const);
