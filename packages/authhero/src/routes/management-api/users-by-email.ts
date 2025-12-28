import { getUsersByEmail } from "../../helpers/users";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { userSchema } from "@authhero/adapter-interfaces";

export const usersByEmailRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/users-by-email
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          email: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },

      security: [
        {
          Bearer: ["read:users-by-email", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "tenant/json": {
              schema: z.array(userSchema),
            },
          },
          description: "List of users",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { email } = ctx.req.valid("query");
      const users = await getUsersByEmail(ctx.env.data.users, tenant_id, email);

      const primarySqlUsers = users.filter((user) => !user.linked_to);

      return ctx.json(primarySqlUsers);
    },
  );
