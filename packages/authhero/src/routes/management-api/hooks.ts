import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  hookInsertSchema,
  hookSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { HTTPException } from "hono/http-exception";
import { generateHookId } from "../../utils/entity-id";

const hopoksWithTotalsSchema = totalsSchema.extend({
  hooks: z.array(hookSchema),
});

export const hooksRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
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
          "tenant-id": z.string().optional(),
        }),
      },

      security: [
        {
          Bearer: ["read:hooks", "auth:read"],
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
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");

      const hooks = await ctx.env.data.hooks.list(ctx.var.tenant_id, {
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
          "tenant-id": z.string().optional(),
        }),
        body: {
          content: {
            "application/json": {
              schema: hookInsertSchema, // Directly use the union schema
            },
          },
        },
      },
      security: [
        {
          Bearer: ["create:hooks", "auth:write"],
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
      const hook = ctx.req.valid("json");

      const hookData = {
        ...hook,
        hook_id: hook.hook_id || generateHookId(),
      };

      const hooks = await ctx.env.data.hooks.create(
        ctx.var.tenant_id,
        hookData,
      );

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
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          hook_id: z.string(),
        }),
        body: {
          content: {
            "application/json": {
              // Apply transformations to each member of the hookInsertSchema union
              schema: z.union([
                hookInsertSchema.options[0].omit({ hook_id: true }).partial(),
                hookInsertSchema.options[1].omit({ hook_id: true }).partial(),
              ]),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["update:hooks", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: hookSchema, // Directly use the union schema
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
      const { hook_id } = ctx.req.valid("param");
      const hook = ctx.req.valid("json");

      await ctx.env.data.hooks.update(ctx.var.tenant_id, hook_id, hook);
      const result = await ctx.env.data.hooks.get(ctx.var.tenant_id, hook_id);

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
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          hook_id: z.string(),
        }),
      },

      security: [
        {
          Bearer: ["read:hooks", "auth:read"],
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
      const { hook_id } = ctx.req.valid("param");

      const hook = await ctx.env.data.hooks.get(ctx.var.tenant_id, hook_id);

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
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          hook_id: z.string(),
        }),
      },

      security: [
        {
          Bearer: ["delete:hooks", "auth:write"],
        },
      ],
      responses: {
        200: {
          description: "A hook",
        },
      },
    }),
    async (ctx) => {
      const { hook_id } = ctx.req.valid("param");

      const result = await ctx.env.data.hooks.remove(
        ctx.var.tenant_id,
        hook_id,
      );

      if (!result) {
        throw new HTTPException(404, { message: "Hook not found" });
      }

      return ctx.text("OK");
    },
  );
