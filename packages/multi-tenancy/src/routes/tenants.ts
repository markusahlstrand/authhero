import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  tenantInsertSchema,
  tenantSchema,
  auth0QuerySchema,
  CreateTenantParams,
} from "authhero";
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
      const user = ctx.var.user as
        | {
            sub: string;
            tenant_id: string;
            scope?: string;
            permissions?: string[];
          }
        | undefined;

      // If user has auth:read or admin:organizations permission, allow access to all tenants
      const userPermissions = user?.permissions || [];
      const hasFullAccess =
        userPermissions.includes("auth:read") ||
        userPermissions.includes("admin:organizations");

      if (hasFullAccess) {
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
      }

      // Get control plane tenant ID from config or from adapters' multiTenancyConfig
      const controlPlaneTenantId =
        config.accessControl?.controlPlaneTenantId ??
        ctx.env.data.multiTenancyConfig?.controlPlaneTenantId;

      // If access control is enabled, filter tenants based on user's organization memberships
      if (controlPlaneTenantId && user?.sub) {
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

        // If user has no accessible tenants, return empty array
        if (accessibleTenantIds.length === 0) {
          if (include_totals) {
            return ctx.json({
              tenants: [],
              start: 0,
              limit: per_page ?? 50,
              length: 0,
            });
          }
          return ctx.json({ tenants: [] });
        }

        // Apply pagination to the accessible tenant IDs
        const totalAccessible = accessibleTenantIds.length;
        const pageNum = page ?? 0;
        const perPage = per_page ?? 50;
        const start = pageNum * perPage;
        const paginatedIds = accessibleTenantIds.slice(start, start + perPage);

        // If this page is beyond the available tenants, return empty array
        if (paginatedIds.length === 0) {
          if (include_totals) {
            return ctx.json({
              tenants: [],
              start,
              limit: perPage,
              length: totalAccessible,
            });
          }
          return ctx.json({ tenants: [] });
        }

        // Fetch only the tenants for this page by ID
        // Construct a query to filter by the paginated IDs
        const idFilter = paginatedIds.map((id) => `id:${id}`).join(" OR ");
        const combinedQuery = q ? `(${idFilter}) AND (${q})` : idFilter;

        const result = await ctx.env.data.tenants.list({
          q: combinedQuery,
          per_page: perPage,
          include_totals: false, // We calculate totals from accessibleTenantIds
        });

        if (include_totals) {
          return ctx.json({
            tenants: result.tenants,
            start,
            limit: perPage,
            length: totalAccessible,
          });
        }

        return ctx.json({ tenants: result.tenants });
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
        409: {
          description: "Tenant with this ID already exists",
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

      // Create the tenant - adapter will throw HTTPException(409) if tenant ID already exists
      const tenant = await ctx.env.data.tenants.create(body);

      // Call afterCreate hook
      if (hooks.tenants?.afterCreate) {
        await hooks.tenants.afterCreate(hookCtx, tenant);
      }

      return ctx.json(tenant, 201);
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

      // Get control plane tenant ID from config or from adapters' multiTenancyConfig
      const controlPlaneTenantId =
        config.accessControl?.controlPlaneTenantId ??
        ctx.env.data.multiTenancyConfig?.controlPlaneTenantId;

      // Validate access and prevent deleting the control plane
      if (controlPlaneTenantId) {
        const user = ctx.var.user;

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
