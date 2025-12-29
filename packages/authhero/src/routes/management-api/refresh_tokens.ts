import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { refreshTokenInsertSchema } from "@authhero/adapter-interfaces";

export const refreshTokensRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/refresh_tokens/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["refresh_tokens"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },

      security: [
        {
          Bearer: ["read:refresh-tokens", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: refreshTokenInsertSchema,
            },
          },
          description: "A session",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const session = await ctx.env.data.refreshTokens.get(
        ctx.var.tenant_id,
        id,
      );

      if (!session) {
        throw new HTTPException(404);
      }

      return ctx.json(session);
    },
  )
  // --------------------------------
  // DELETE /api/v2/refresh_tokens/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["refresh_tokens"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["delete:refresh-tokens", "auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.refreshTokens.remove(
        ctx.var.tenant_id,
        id,
      );
      if (!result) {
        throw new HTTPException(404, {
          message: "Session not found",
        });
      }

      return ctx.text("OK");
    },
  );
