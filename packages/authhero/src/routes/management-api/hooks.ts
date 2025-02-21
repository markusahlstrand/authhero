import { Bindings } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  hookInsertSchema,
  hookSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { HTTPException } from "hono/http-exception";

const hopoksWithTotalsSchema = totalsSchema.extend({
  hooks: z.array(hookSchema),
});

export const hooksRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
  // --------------------------------
  // GET /api/v2/hooks
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["hooks"],
      method: "get",
      path: "/",
      request: {
        query: querySchema,
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
              schema: z.union([z.array(hookSchema), hopoksWithTotalsSchema]),
            },
          },
          description: "List of hooks",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");

      const hooks = await ctx.env.data.hooks.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (!include_totals) {
        return ctx.json(hooks.hooks);
      }

      return ctx.json(hooks);
    },
  )
  // --------------------------------
  // POST /api/v2/hooks
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["hooks"],
      method: "post",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(hookInsertSchema.shape),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: hookSchema,
            },
          },
          description: "The created hook",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const hook = ctx.req.valid("json");

      const hooks = await ctx.env.data.hooks.create(tenant_id, hook);

      return ctx.json(hooks, { status: 201 });
    },
  )
  // --------------------------------
  // PATCH /api/v2/hooks/:hook_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["hooks"],
      method: "patch",
      path: "/{hook_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          hook_id: z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z
                .object(hookInsertSchema.shape)
                .omit({ hook_id: true })
                .partial(),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: hookSchema.shape,
            },
          },
          description: "The updated hook",
        },
        404: {
          description: "Hook not found",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { hook_id } = ctx.req.valid("param");
      const hook = ctx.req.valid("json");

      await ctx.env.data.hooks.update(tenant_id, hook_id, hook);
      const result = await ctx.env.data.hooks.get(tenant_id, hook_id);

      if (!result) {
        throw new HTTPException(404, { message: "Hook not found" });
      }

      return ctx.json(result);
    },
  )
  // --------------------------------
  // GET /api/v2/hooks/:hook_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["hooks"],
      method: "get",
      path: "/{hook_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          hook_id: z.string(),
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
              schema: hookSchema,
            },
          },
          description: "A hook",
        },
        404: {
          description: "Hook not found",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { hook_id } = ctx.req.valid("param");

      const hook = await ctx.env.data.hooks.get(tenant_id, hook_id);

      if (!hook) {
        throw new HTTPException(404, { message: "Hook not found" });
      }

      return ctx.json(hook);
    },
  )
  // --------------------------------
  // DELETE /api/v2/hooks/:hook_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["hooks"],
      method: "delete",
      path: "/{hook_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          hook_id: z.string(),
        }),
      },

      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          description: "A hook",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { hook_id } = ctx.req.valid("param");

      const result = await ctx.env.data.hooks.remove(tenant_id, hook_id);

      if (!result) {
        throw new HTTPException(404, { message: "Hook not found" });
      }

      return ctx.text("OK");
    },
  );
