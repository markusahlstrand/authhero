import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  tenantInsertSchema,
  tenantSchema,
  auth0QuerySchema,
  CreateTenantParams,
} from "@authhero/adapter-interfaces";
import {
  MultiTenancyBindings,
  MultiTenancyVariables,
  MultiTenancyConfig,
  MultiTenancyHooks,
  TenantHookContext,
} from "../types";
import { fetchAll } from "authhero";

/**
 * Creates OpenAPI-based tenant management routes.
 *
 * These routes handle CRUD operations for tenants and are designed to be
 * mounted on authhero's management API so they get the same authentication
 * middleware.
 *
 * @param config - Multi-tenancy configuration
 * @param hooks - Multi-tenancy hooks for lifecycle events
 * @returns OpenAPIHono router with tenant routes
 */
export function createTenantsOpenAPIRouter(
  config: MultiTenancyConfig,
  hooks: MultiTenancyHooks,
) {
  const app = new OpenAPIHono<{
    Bindings: MultiTenancyBindings;
    Variables: MultiTenancyVariables;
  }>();

  // --------------------------------
  // GET / - List tenants the user has access to
  // --------------------------------
  app.openapi(
    createRoute({
      tags: ["tenants"],
      method: "get",
      path: "/",
      request: {
        query: auth0QuerySchema,
      },
      security: [
        {
          Bearer: [],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                tenants: z.array(tenantSchema),
                start: z.number().optional(),
                limit: z.number().optional(),
                length: z.number().optional(),
              }),
            },
          },
          description: "List of tenants",
        },
      },
    }),
    async (ctx) => {
      const query = ctx.req.valid("query");
      const { page, per_page, include_totals, q } = query;

      // Get the current user from context (set by authhero's auth middleware)
      const user = ctx.var.user;

      // If access control is enabled, filter tenants based on user's organization memberships
      if (config.accessControl && user?.sub) {
        const controlPlaneTenantId = config.accessControl.controlPlaneTenantId;

        // Get all organizations the user belongs to on the control plane
        const userOrgs = await fetchAll<{ id: string; name: string }>(
          (params) =>
            ctx.env.data.userOrganizations.listUserOrganizations(
              controlPlaneTenantId,
              user.sub,
              params,
            ),
          "organizations",
        );

        // The organization names correspond to tenant IDs the user can access
        // (organization name is set to tenant ID when creating tenant organizations)
        const accessibleTenantIds = userOrgs.map((org) => org.name);

        // Get all tenants and filter to only those the user has access to
        const result = await ctx.env.data.tenants.list({
          page,
          per_page,
          include_totals,
          q,
        });

        // Filter tenants to only those the user has access to
        const filteredTenants = result.tenants.filter((tenant) =>
          accessibleTenantIds.includes(tenant.id),
        );

        if (include_totals) {
          return ctx.json({
            tenants: filteredTenants,
            start: result.totals?.start ?? 0,
            limit: result.totals?.limit ?? per_page,
            length: filteredTenants.length,
          });
        }

        return ctx.json({ tenants: filteredTenants });
      }

      // If no access control, return all tenants (for backward compatibility)
      const result = await ctx.env.data.tenants.list({
        page,
        per_page,
        include_totals,
        q,
      });

      if (include_totals) {
        return ctx.json({
          tenants: result.tenants,
          start: result.totals?.start ?? 0,
          limit: result.totals?.limit ?? per_page,
          length: result.tenants.length,
        });
      }

      return ctx.json({ tenants: result.tenants });
    },
  );

  // --------------------------------
  // GET /:id - Get a tenant
  // --------------------------------
  app.openapi(
    createRoute({
      tags: ["tenants"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
      },
      security: [
        {
          Bearer: [],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: tenantSchema,
            },
          },
          description: "Tenant details",
        },
        404: {
          description: "Tenant not found",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      // Validate access via organization membership
      if (config.accessControl) {
        const user = ctx.var.user;
        const controlPlaneTenantId = config.accessControl.controlPlaneTenantId;

        // Control plane is accessible to any authenticated user
        if (id !== controlPlaneTenantId) {
          if (!user?.sub) {
            throw new HTTPException(401, {
              message: "Authentication required",
            });
          }

          // Check if user is a member of the organization for this tenant
          const userOrgs = await fetchAll<{ id: string; name: string }>(
            (params) =>
              ctx.env.data.userOrganizations.listUserOrganizations(
                controlPlaneTenantId,
                user.sub,
                params,
              ),
            "organizations",
          );

          const hasAccess = userOrgs.some((org) => org.name === id);
          if (!hasAccess) {
            throw new HTTPException(403, {
              message: "Access denied to this tenant",
            });
          }
        }
      }

      const tenant = await ctx.env.data.tenants.get(id);

      if (!tenant) {
        throw new HTTPException(404, {
          message: "Tenant not found",
        });
      }

      return ctx.json(tenant);
    },
  );

  // --------------------------------
  // POST / - Create a tenant
  // --------------------------------
  app.openapi(
    createRoute({
      tags: ["tenants"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: tenantInsertSchema,
            },
          },
        },
      },
      security: [
        {
          Bearer: [],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: tenantSchema,
            },
          },
          description: "Tenant created",
        },
        400: {
          description: "Validation error",
        },
      },
    }),
    async (ctx) => {
      // Ensure user is authenticated
      const user = ctx.var.user;
      if (!user?.sub) {
        throw new HTTPException(401, {
          message: "Authentication required to create tenants",
        });
      }

      let body: CreateTenantParams = ctx.req.valid("json");

      // Create hook context
      const hookCtx: TenantHookContext = {
        adapters: ctx.env.data,
        ctx,
      };

      // Call beforeCreate hook
      if (hooks.tenants?.beforeCreate) {
        body = await hooks.tenants.beforeCreate(hookCtx, body);
      }

      // Create the tenant
      const tenant = await ctx.env.data.tenants.create(body);

      // Call afterCreate hook
      if (hooks.tenants?.afterCreate) {
        await hooks.tenants.afterCreate(hookCtx, tenant);
      }

      return ctx.json(tenant, 201);
    },
  );

  // --------------------------------
  // PATCH /:id - Update a tenant
  // --------------------------------
  app.openapi(
    createRoute({
      tags: ["tenants"],
      method: "patch",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object(tenantInsertSchema.shape).partial(),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["update:tenants"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: tenantSchema,
            },
          },
          description: "Tenant updated",
        },
        403: {
          description: "Access denied",
        },
        404: {
          description: "Tenant not found",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      // Validate access via organization membership
      if (config.accessControl) {
        const user = ctx.var.user;
        const controlPlaneTenantId = config.accessControl.controlPlaneTenantId;

        if (!user?.sub) {
          throw new HTTPException(401, {
            message: "Authentication required",
          });
        }

        // Control plane can only be updated by users who have access to it
        // For child tenants, check organization membership
        if (id !== controlPlaneTenantId) {
          const userOrgs = await fetchAll<{ id: string; name: string }>(
            (params) =>
              ctx.env.data.userOrganizations.listUserOrganizations(
                controlPlaneTenantId,
                user.sub,
                params,
              ),
            "organizations",
          );

          const hasAccess = userOrgs.some((org) => org.name === id);
          if (!hasAccess) {
            throw new HTTPException(403, {
              message: "Access denied to this tenant",
            });
          }
        }
      }

      const tenant = await ctx.env.data.tenants.get(id);
      if (!tenant) {
        throw new HTTPException(404, {
          message: "Tenant not found",
        });
      }

      const updates = ctx.req.valid("json");

      // Create hook context
      const hookCtx: TenantHookContext = {
        adapters: ctx.env.data,
        ctx,
      };

      // Call beforeUpdate hook
      let processedUpdates = updates;
      if (hooks.tenants?.beforeUpdate) {
        processedUpdates = await hooks.tenants.beforeUpdate(
          hookCtx,
          id,
          updates,
        );
      }

      // Update the tenant
      await ctx.env.data.tenants.update(id, processedUpdates);

      // Get the updated tenant
      const updatedTenant = await ctx.env.data.tenants.get(id);

      if (!updatedTenant) {
        throw new HTTPException(500, {
          message: "Failed to retrieve updated tenant",
        });
      }

      // Call afterUpdate hook
      if (hooks.tenants?.afterUpdate) {
        await hooks.tenants.afterUpdate(hookCtx, updatedTenant);
      }

      return ctx.json(updatedTenant);
    },
  );

  // --------------------------------
  // DELETE /:id - Delete a tenant
  // --------------------------------
  app.openapi(
    createRoute({
      tags: ["tenants"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["delete:tenants"],
        },
      ],
      responses: {
        204: {
          description: "Tenant deleted",
        },
        403: {
          description: "Access denied or cannot delete the control plane",
        },
        404: {
          description: "Tenant not found",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      // Validate access and prevent deleting the control plane
      if (config.accessControl) {
        const user = ctx.var.user;
        const controlPlaneTenantId = config.accessControl.controlPlaneTenantId;

        if (!user?.sub) {
          throw new HTTPException(401, {
            message: "Authentication required",
          });
        }

        // Cannot delete the control plane
        if (id === controlPlaneTenantId) {
          throw new HTTPException(403, {
            message: "Cannot delete the control plane",
          });
        }

        // Check organization membership
        const userOrgs = await fetchAll<{ id: string; name: string }>(
          (params) =>
            ctx.env.data.userOrganizations.listUserOrganizations(
              controlPlaneTenantId,
              user.sub,
              params,
            ),
          "organizations",
        );

        const hasAccess = userOrgs.some((org) => org.name === id);
        if (!hasAccess) {
          throw new HTTPException(403, {
            message: "Access denied to this tenant",
          });
        }
      }

      const tenant = await ctx.env.data.tenants.get(id);
      if (!tenant) {
        throw new HTTPException(404, {
          message: "Tenant not found",
        });
      }

      // Create hook context
      const hookCtx: TenantHookContext = {
        adapters: ctx.env.data,
        ctx,
      };

      // Call beforeDelete hook
      if (hooks.tenants?.beforeDelete) {
        await hooks.tenants.beforeDelete(hookCtx, id);
      }

      // Delete the tenant
      await ctx.env.data.tenants.remove(id);

      // Call afterDelete hook
      if (hooks.tenants?.afterDelete) {
        await hooks.tenants.afterDelete(hookCtx, id);
      }

      return ctx.body(null, 204);
    },
  );

  return app;
}
