import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { userInfoSchema } from "../../types/UserInto";

export const userinfoRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /userinfo
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth2"],
      method: "get",
      path: "/",
      request: {},
      security: [
        {
          Bearer: ["openid"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: userInfoSchema,
            },
          },
          description: "Userinfo",
        },
      },
    }),
    async (ctx) => {
      if (!ctx.var.user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      const user = await ctx.env.data.users.get(
        ctx.var.user.tenant_id,
        ctx.var.user.sub,
      );
      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      return ctx.json(userInfoSchema.parse({ ...user, sub: user.user_id }));
    },
  );
