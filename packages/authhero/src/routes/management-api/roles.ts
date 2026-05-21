import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import {
  roleSchema,
  roleInsertSchema,
  totalsSchema,
  rolePermissionSchema,
  rolePermissionListSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";

const rolesWithTotalsSchema = totalsSchema.extend({
  roles: z.array(roleSchema),
});

const rolePermissionsWithTotalsSchema = totalsSchema.extend({
  permissions: z.array(rolePermissionSchema),
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
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:roles"],
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

      const tenantId = ctx.var.tenant_id;
      if (!tenantId) {
        throw new HTTPException(400, {
          message: "tenant-id header is required",
        });
      }

      const result = await ctx.env.data.roles.list(tenantId, {
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
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:roles"],
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

      const tenantId = ctx.var.tenant_id;
      if (!tenantId) {
        throw new HTTPException(400, {
          message: "tenant-id header is required",
        });
      }

      const role = await ctx.env.data.roles.get(tenantId, id);

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
          "tenant-id": z.string().optional(),
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
          Bearer: ["create:roles"],
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
      const body = ctx.req.valid("json");
      const tenantId = ctx.var.tenant_id;
      if (!tenantId) {
        throw new HTTPException(400, {
          message: "tenant-id header is required",
        });
      }

      const role = await ctx.env.data.roles.create(tenantId, body);

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Create a Role",
        targetType: "role",
        targetId: role.id,
        afterState: role as unknown as Record<string, unknown>,
      });

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
          "tenant-id": z.string().optional(),
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
          Bearer: ["update:roles"],
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
      const body = ctx.req.valid("json");
      const tenantId = ctx.var.tenant_id;
      if (!tenantId) {
        throw new HTTPException(400, {
          message: "tenant-id header is required",
        });
      }

      const updated = await ctx.env.data.roles.update(tenantId, id, body);

      if (!updated) {
        throw new HTTPException(404);
      }

      const role = await ctx.env.data.roles.get(tenantId, id);

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update a Role",
        targetType: "role",
        targetId: id,
        afterState: role as unknown as Record<string, unknown>,
      });

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
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["delete:roles"],
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
      const tenantId = ctx.var.tenant_id;
      if (!tenantId) {
        throw new HTTPException(400, {
          message: "tenant-id header is required",
        });
      }

      const deleted = await ctx.env.data.roles.remove(tenantId, id);

      if (!deleted) {
        throw new HTTPException(404);
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete a Role",
        targetType: "role",
        targetId: id,
      });

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
          "tenant-id": z.string().optional(),
        }),
        query: querySchema,
      },
      security: [
        {
          Bearer: ["read:roles"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([
                rolePermissionListSchema,
                rolePermissionsWithTotalsSchema,
              ]),
            },
          },
          description: "Role permissions",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");

      const tenantId = ctx.var.tenant_id;
      if (!tenantId) {
        throw new HTTPException(400, {
          message: "tenant-id header is required",
        });
      }

      // Check if role exists first
      const role = await ctx.env.data.roles.get(tenantId, id);

      if (!role) {
        throw new HTTPException(404, {
          message: "Role not found",
        });
      }

      // Auth0's GET /roles/:id/permissions returns the raw array by default,
      // but { permissions, total, start, limit } when include_totals=true.
      // SDKs (e.g. go-auth0) decode into a PermissionList struct and rely on
      // the wrapped form, so honor the flag rather than always returning array.
      if (include_totals) {
        // The rolePermissions adapter returns an array (no totals shape), so
        // fetch a large window to compute an accurate total and slice in
        // memory. Roles have a bounded number of permissions in practice.
        const all = await ctx.env.data.rolePermissions.list(tenantId, id, {
          per_page: 10000,
          sort: parseSort(sort),
          q,
        });
        const limit = per_page ?? 50;
        const start = (page ?? 0) * limit;
        const slice = all.slice(start, start + limit);
        return ctx.json({
          permissions: slice,
          total: all.length,
          start,
          limit,
          length: slice.length,
        });
      }

      const permissions = await ctx.env.data.rolePermissions.list(
        tenantId,
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
          "tenant-id": z.string().optional(),
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
          Bearer: ["update:roles"],
        },
      ],
      responses: {
        204: {
          description: "Permissions assigned to role",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const { permissions } = ctx.req.valid("json");
      const tenantId = ctx.var.tenant_id;
      if (!tenantId) {
        throw new HTTPException(400, {
          message: "tenant-id header is required",
        });
      }

      // Check if role exists first
      const role = await ctx.env.data.roles.get(tenantId, id);
      if (!role) {
        throw new HTTPException(404, {
          message: "Role not found",
        });
      }

      const permissionsToAssign = permissions.map((p) => ({
        role_id: id,
        resource_server_identifier: p.resource_server_identifier,
        permission_name: p.permission_name,
      }));

      // Use the role permissions adapter to assign permissions
      const success = await ctx.env.data.rolePermissions.assign(
        tenantId,
        id,
        permissionsToAssign,
      );

      if (!success) {
        throw new HTTPException(500, {
          message: "Failed to assign permissions to role",
        });
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Assign Permissions to a Role",
        targetType: "role_permission",
        targetId: id,
      });

      // Auth0 returns 204 No Content for POST /roles/{id}/permissions; matching
      // it lets SDKs (e.g. go-auth0) skip body decoding.
      return ctx.body(null, 204);
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
          "tenant-id": z.string().optional(),
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
          Bearer: ["update:roles"],
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
      const { permissions } = ctx.req.valid("json");
      const tenantId = ctx.var.tenant_id;
      if (!tenantId) {
        throw new HTTPException(400, {
          message: "tenant-id header is required",
        });
      }

      // Check if role exists first
      const role = await ctx.env.data.roles.get(tenantId, id);
      if (!role) {
        throw new HTTPException(404, {
          message: "Role not found",
        });
      }

      // Use the role permissions adapter to remove permissions
      const success = await ctx.env.data.rolePermissions.remove(
        tenantId,
        id,
        permissions,
      );

      if (!success) {
        throw new HTTPException(500, {
          message: "Failed to remove permissions from role",
        });
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Remove Permissions from a Role",
        targetType: "role_permission",
        targetId: id,
      });

      return ctx.json({ message: "Permissions removed successfully" });
    },
  );
