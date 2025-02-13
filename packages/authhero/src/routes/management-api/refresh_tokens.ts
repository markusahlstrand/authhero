import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings } from "../../types";
import { HTTPException } from "hono/http-exception";
import { refreshTokenInsertSchema } from "@authhero/adapter-interfaces";

export const refreshTokensRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
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
          "tenant-id": z.string(),
        }),
      },

      security: [
        {
          Bearer: ["auth:read"],
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
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const session = await ctx.env.data.refreshTokens.get(tenant_id, id);

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
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.refreshTokens.remove(tenant_id, id);
      if (!result) {
        throw new HTTPException(404, {
          message: "Session not found",
        });
      }

      return ctx.text("OK");
    },
  );
