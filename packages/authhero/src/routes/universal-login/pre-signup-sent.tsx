import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import PreSignUpConfirmationPage from "../../components/PreSignUpConfirmationPage";
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
      const { theme, branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

      const { username } = loginSession.authParams;

      if (!username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      return ctx.html(
        <PreSignUpConfirmationPage
          theme={theme}
          branding={branding}
          client={client}
          state={state}
          email={username}
        />,
      );
    },
});


export const preSignupSentRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  .openapiRoutes([getRoot] as const);
