import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import {
  roleSchema,
  roleInsertSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";

const rolesWithTotalsSchema = totalsSchema.extend({
  roles: z.array(roleSchema),
});

export const roleRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["roles"],
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
              schema: z.union([z.array(roleSchema), rolesWithTotalsSchema]),
            },
          },
          description: "List of roles",
        },
      },
    }),
    async (ctx) => {
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const result = await ctx.env.data.roles.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (include_totals) {
        return ctx.json(result);
      }

      return ctx.json(result.roles);
    },
  )
  // --------------------------------
  // GET /api/v2/roles/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["roles"],
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
              schema: roleSchema,
            },
          },
          description: "A role",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const role = await ctx.env.data.roles.get(tenant_id, id);

      if (!role) {
        throw new HTTPException(404);
      }

      return ctx.json(role);
    },
  )
  // --------------------------------
  // POST /api/v2/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["roles"],
      method: "post",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: roleInsertSchema,
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
              schema: roleSchema,
            },
          },
          description: "Role created",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const role = await ctx.env.data.roles.create(tenant_id, body);

      return ctx.json(role, { status: 201 });
    },
  )
  // --------------------------------
  // PATCH /api/v2/roles/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["roles"],
      method: "patch",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: roleInsertSchema.partial(),
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
              schema: roleSchema,
            },
          },
          description: "Updated role",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const updated = await ctx.env.data.roles.update(tenant_id, id, body);

      if (!updated) {
        throw new HTTPException(404);
      }

      const role = await ctx.env.data.roles.get(tenant_id, id);
      return ctx.json(role!);
    },
  )
  // --------------------------------
  // DELETE /api/v2/roles/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["roles"],
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
      const { id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const deleted = await ctx.env.data.roles.remove(tenant_id, id);

      if (!deleted) {
        throw new HTTPException(404);
      }

      return ctx.text("OK");
    },
  );
