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
import { getIssuer } from "../../variables";
import { getDefaultUserPicture } from "../../helpers/avatar";

import { defineRoute } from "../../utils/define-route";
const rolesWithTotalsSchema = totalsSchema.extend({
  roles: z.array(roleSchema),
});

const rolePermissionsWithTotalsSchema = totalsSchema.extend({
  permissions: z.array(rolePermissionSchema),
});

// Auth0's GET /roles/{id}/users returns user summaries, not full profiles.
const roleUserSchema = z.object({
  user_id: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

const roleUsersWithTotalsSchema = totalsSchema.extend({
  users: z.array(roleUserSchema),
});

const roleUsersWithNextSchema = z.object({
  next: z.string().optional().openapi({
    description:
      "Checkpoint cursor to be used to retrieve the next set of results",
  }),
  users: z.array(roleUserSchema),
});

// Auth0 caps per_page/take at 100 on this endpoint; the cap also bounds the
// hydration fan-out below (one users.get() per returned user). Only the
// parameters the handler consumes are accepted — Auth0 supports neither
// sort nor q here.
const roleUsersQuerySchema = querySchema
  .pick({
    page: true,
    per_page: true,
    include_totals: true,
    from: true,
    take: true,
  })
  .extend({
    per_page: querySchema.shape.per_page.pipe(
      z.number().int().min(0).max(100),
    ),
    take: querySchema.shape.take.pipe(
      z.number().int().min(1).max(100).optional(),
    ),
  });
const getRoot = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
    const { page, per_page, include_totals, sort, q } = ctx.req.valid("query");

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
});

const getById = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
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
});

const postRoot = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
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
});

const patchById = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
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
});

const deleteById = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
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
});

const getByIdPermissions = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");

    const { page, per_page, include_totals, sort, q } = ctx.req.valid("query");

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

    const permissions = await ctx.env.data.rolePermissions.list(tenantId, id, {
      page,
      per_page,
      include_totals: false,
      sort: parseSort(sort),
      q,
    });
    return ctx.json(permissions);
  },
});

const getByIdUsers = defineRoute({
  route: createRoute({
    tags: ["roles"],
    method: "get",
    path: "/{id}/users",
    request: {
      params: z.object({
        id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      query: roleUsersQuerySchema,
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
              z.array(roleUserSchema),
              roleUsersWithTotalsSchema,
              roleUsersWithNextSchema,
            ]),
          },
        },
        description: "Users assigned to the role",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");
    const { page, per_page, include_totals, from, take } =
      ctx.req.valid("query");

    const tenantId = ctx.var.tenant_id;
    if (!tenantId) {
      throw new HTTPException(400, {
        message: "tenant-id header is required",
      });
    }

    const role = await ctx.env.data.roles.get(tenantId, id);
    if (!role) {
      throw new HTTPException(404, {
        message: "Role not found",
      });
    }

    // Pass through checkpoint pagination (from/take) as well as
    // page/per_page so clients using either style — e.g. the Auth0 SDK,
    // which sends from/take past 1000 results — page correctly.
    const result = await ctx.env.data.userRoles.listUsers(tenantId, id, {
      page,
      per_page,
      include_totals,
      from,
      take,
    });

    const users = await Promise.all(
      result.userIds.map(async (userId) => {
        const user = await ctx.env.data.users.get(tenantId, userId);
        if (!user) return null;
        return {
          user_id: user.user_id,
          email: user.email || undefined,
          name: user.name || undefined,
          picture:
            user.picture ||
            getDefaultUserPicture(
              getIssuer(ctx.env, ctx.var.custom_domain),
              user,
            ),
        };
      }),
    ).then((rows) =>
      rows.filter((r): r is NonNullable<typeof r> => r !== null),
    );

    // Keyset (checkpoint) pagination: return Auth0's { users, next } shape so
    // clients can page past the first page via the opaque cursor.
    if (from !== undefined || take !== undefined) {
      return ctx.json({ users, next: result.next });
    }

    if (include_totals) {
      return ctx.json({
        users,
        start: result.start,
        limit: result.limit,
        length: users.length,
        total: result.length,
      });
    }

    return ctx.json(users);
  },
});

const postByIdPermissions = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
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
});

const deleteByIdPermissions = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
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
});

export const roleRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getRoot,
  getById,
  postRoot,
  patchById,
  deleteById,
  getByIdPermissions,
  getByIdUsers,
  postByIdPermissions,
  deleteByIdPermissions,
] as const);
