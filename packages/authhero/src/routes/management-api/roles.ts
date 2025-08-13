import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import {
  roleSchema,
  roleInsertSchema,
  totalsSchema,
  rolePermissionWithDetailsListSchema,
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
  )
  // --------------------------------
  // GET /api/v2/roles/:id/permissions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["roles"],
      method: "get",
      path: "/{id}/permissions",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        query: querySchema,
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
              schema: rolePermissionWithDetailsListSchema,
            },
          },
          description: "Role permissions",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const { page, per_page, sort, q } = ctx.req.valid("query");

      // Check if role exists first
      const role = await ctx.env.data.roles.get(tenant_id, id);

      if (!role) {
        throw new HTTPException(404, {
          message: "Role not found",
        });
      }

      // Get permissions assigned to this role using the new adapter
      const permissions = await ctx.env.data.rolePermissions.list(
        tenant_id,
        id,
        {
          page,
          per_page,
          include_totals: false,
          sort: parseSort(sort),
          q,
        },
      );

      return ctx.json(permissions);
    },
  )
  // --------------------------------
  // POST /api/v2/roles/:id/permissions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["roles"],
      method: "post",
      path: "/{id}/permissions",
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
              schema: z.object({
                permissions: z.array(
                  z.object({
                    permission_name: z.string(),
                    resource_server_identifier: z.string(),
                  }),
                ),
              }),
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
          description: "Permissions assigned to role",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { permissions } = ctx.req.valid("json");

      // Check if role exists first
      const role = await ctx.env.data.roles.get(tenant_id, id);
      if (!role) {
        throw new HTTPException(404, {
          message: "Role not found",
        });
      }

      // Use the new role permissions adapter to assign permissions
      const success = await ctx.env.data.rolePermissions.assign(
        tenant_id,
        id,
        permissions.map((p) => ({
          role_id: id,
          resource_server_identifier: p.resource_server_identifier,
          permission_name: p.permission_name,
        })),
      );

      if (!success) {
        throw new HTTPException(500, {
          message: "Failed to assign permissions to role",
        });
      }

      return ctx.json(
        { message: "Permissions assigned successfully" },
        { status: 201 },
      );
    },
  )
  // --------------------------------
  // DELETE /api/v2/roles/:id/permissions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["roles"],
      method: "delete",
      path: "/{id}/permissions",
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
              schema: z.object({
                permissions: z.array(
                  z.object({
                    permission_name: z.string(),
                    resource_server_identifier: z.string(),
                  }),
                ),
              }),
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
          description: "Permissions removed from role",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { permissions } = ctx.req.valid("json");

      // Check if role exists first
      const role = await ctx.env.data.roles.get(tenant_id, id);
      if (!role) {
        throw new HTTPException(404, {
          message: "Role not found",
        });
      }

      // Use the new role permissions adapter to remove permissions
      const success = await ctx.env.data.rolePermissions.remove(
        tenant_id,
        id,
        permissions,
      );

      if (!success) {
        throw new HTTPException(500, {
          message: "Failed to remove permissions from role",
        });
      }

      return ctx.json({ message: "Permissions removed successfully" });
    },
  );
