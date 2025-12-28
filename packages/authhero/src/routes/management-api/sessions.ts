import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { sessionSchema } from "@authhero/adapter-interfaces";

export const sessionsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/sessions/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["sessions"],
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
          Bearer: ["read:sessions", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: sessionSchema,
            },
          },
          description: "A session",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const session = await ctx.env.data.sessions.get(ctx.var.tenant_id, id);

      if (!session) {
        throw new HTTPException(404);
      }

      return ctx.json(session);
    },
  )
  // --------------------------------
  // DELETE /api/v2/sessions/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["sessions"],
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
          Bearer: ["delete:sessions", "auth:write"],
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

      const result = await ctx.env.data.sessions.remove(ctx.var.tenant_id, id);
      if (!result) {
        throw new HTTPException(404, {
          message: "Session not found",
        });
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // POST /api/v2/sessions/:id/revoke
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["sessions"],
      method: "post",
      path: "/{id}/revoke",
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
          Bearer: ["update:sessions", "auth:write"],
        },
      ],
      responses: {
        202: {
          description: "Sesssion deletion status",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.sessions.update(ctx.var.tenant_id, id, {
        revoked_at: new Date().toDateString(),
      });
      if (!result) {
        throw new HTTPException(404, {
          message: "Session not found",
        });
      }

      return ctx.text("Session deletion request accepted.", { status: 202 });
    },
  );
