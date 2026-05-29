import { getUsersByEmail } from "../../helpers/users";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { userSchema } from "@authhero/adapter-interfaces";
import { defineRoute } from "../../utils/define-route";
const getRoot = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/",
    request: {
      query: z.object({
        email: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },

    security: [
      {
        Bearer: ["read:users", "auth:read"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(userSchema),
          },
        },
        description: "List of users",
      },
    },
  }),
  handler: async (ctx) => {
    const { email } = ctx.req.valid("query");
    const users = await getUsersByEmail(
      ctx.env.data.users,
      ctx.var.tenant_id,
      email,
    );

    const primarySqlUsers = users.filter((user) => !user.linked_to);

    return ctx.json(primarySqlUsers);
  },
});

export const usersByEmailRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot] as const);
