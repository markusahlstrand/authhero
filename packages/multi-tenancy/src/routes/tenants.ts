import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  tenantInsertSchema,
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

/**
 * Creates the tenant management routes.
 *
 * These routes handle CRUD operations for tenants and should be mounted
 * on a management API path (e.g., /management/tenants).
 *
 * Access to these routes should be restricted to the main tenant.
 *
 * @param config - Multi-tenancy configuration
 * @param hooks - Multi-tenancy hooks for lifecycle events
 * @returns Hono router with tenant routes
 */
export function createTenantsRouter(
  config: MultiTenancyConfig,
  hooks: MultiTenancyHooks,
) {
  const app = new Hono<{
    Bindings: MultiTenancyBindings;
    Variables: MultiTenancyVariables;
  }>();

  // --------------------------------
  // GET /tenants - List tenants the user has access to
  // --------------------------------
  app.get("/", async (ctx) => {
    const query = auth0QuerySchema.parse(ctx.req.query());
    const { page, per_page, include_totals, q } = query;

    // Get the current user from context (set by authhero's auth middleware)
    const user = ctx.var.user;

    // If access control is enabled, filter tenants based on user's organization memberships
    if (config.accessControl && user?.sub) {
      const mainTenantId = config.accessControl.mainTenantId;

      // Get all organizations the user belongs to on the main tenant
      const userOrgs =
        await ctx.env.data.userOrganizations.listUserOrganizations(
          mainTenantId,
          user.sub,
          {},
        );

      // The organization names correspond to tenant IDs the user can access
      // (organization name is set to tenant ID when creating tenant organizations)
      const accessibleTenantIds = userOrgs.organizations.map(
        (org) => org.name,
      );

      // Always include the main tenant if the user is authenticated
      if (!accessibleTenantIds.includes(mainTenantId)) {
        accessibleTenantIds.push(mainTenantId);
      }

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

      return ctx.json(filteredTenants);
    }

    // If no access control, return all tenants (for backward compatibility)
    const result = await ctx.env.data.tenants.list({
      page,
      per_page,
      include_totals,
      q,
    });

    if (include_totals) {
      return ctx.json(result);
    }

    return ctx.json(result.tenants);
  });

  // --------------------------------
  // GET /tenants/:id - Get a tenant
  // --------------------------------
  app.get("/:id", async (ctx) => {
    const id = ctx.req.param("id");

    // Validate access via organization membership
    if (config.accessControl) {
      const user = ctx.var.user;
      const mainTenantId = config.accessControl.mainTenantId;

      // Main tenant is accessible to any authenticated user
      if (id !== mainTenantId) {
        if (!user?.sub) {
          throw new HTTPException(401, {
            message: "Authentication required",
          });
        }

        // Check if user is a member of the organization for this tenant
        const userOrgs =
          await ctx.env.data.userOrganizations.listUserOrganizations(
            mainTenantId,
            user.sub,
            {},
          );

        const hasAccess = userOrgs.organizations.some((org) => org.id === id);
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
  });

  // --------------------------------
  // POST /tenants - Create a tenant
  // --------------------------------
  // Any authenticated user can create a tenant. The user will be automatically
  // added to the organization for that tenant with admin permissions via the
  // afterCreate hook in provisioning.ts
  app.post("/", async (ctx) => {
    try {
      // Ensure user is authenticated
      const user = ctx.var.user;
      if (!user?.sub) {
        throw new HTTPException(401, {
          message: "Authentication required to create tenants",
        });
      }

      let body: CreateTenantParams = tenantInsertSchema.parse(
        await ctx.req.json(),
      );

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
    } catch (error) {
      // Handle validation errors
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: "Validation error",
          cause: error,
        });
      }

      // Handle duplicate key errors
      if (
        error instanceof Error &&
        (("code" in error && error.code === "SQLITE_CONSTRAINT_PRIMARYKEY") ||
          error.message?.includes("UNIQUE constraint failed"))
      ) {
        throw new HTTPException(409, {
          message: "Tenant with this ID already exists",
        });
      }

      // Re-throw other errors
      throw error;
    }
  });

  // --------------------------------
  // PATCH /tenants/:id - Update a tenant
  // --------------------------------
  app.patch("/:id", async (ctx) => {
    const id = ctx.req.param("id");

    // Validate access via organization membership
    if (config.accessControl) {
      const user = ctx.var.user;
      if (!user?.sub) {
        throw new HTTPException(401, {
          message: "Authentication required to update tenants",
        });
      }

      const mainTenantId = config.accessControl.mainTenantId;

      // Check if user is a member of the organization for this tenant
      // (unless it's the main tenant, which has different access rules)
      if (id !== mainTenantId) {
        const userOrgs =
          await ctx.env.data.userOrganizations.listUserOrganizations(
            mainTenantId,
            user.sub,
            {},
          );

        const hasAccess = userOrgs.organizations.some((org) => org.id === id);
        if (!hasAccess) {
          throw new HTTPException(403, {
            message: "Access denied to update this tenant",
          });
        }
      }
    }

    const body = tenantInsertSchema.partial().parse(await ctx.req.json());

    // Strip protected fields
    const { id: _, ...rawUpdates } = body as { id?: string };

    const existingTenant = await ctx.env.data.tenants.get(id);
    if (!existingTenant) {
      throw new HTTPException(404, {
        message: "Tenant not found",
      });
    }

    // Create hook context
    const hookCtx: TenantHookContext = {
      adapters: ctx.env.data,
      ctx,
    };

    // Call beforeUpdate hook
    let updates = rawUpdates;
    if (hooks.tenants?.beforeUpdate) {
      updates = await hooks.tenants.beforeUpdate(hookCtx, id, rawUpdates);
    }

    await ctx.env.data.tenants.update(id, updates);

    const updatedTenant = await ctx.env.data.tenants.get(id);
    if (!updatedTenant) {
      throw new HTTPException(404, {
        message: "Tenant not found after update",
      });
    }

    // Call afterUpdate hook
    if (hooks.tenants?.afterUpdate) {
      await hooks.tenants.afterUpdate(hookCtx, updatedTenant);
    }

    return ctx.json(updatedTenant);
  });

  // --------------------------------
  // DELETE /tenants/:id - Delete a tenant
  // --------------------------------
  app.delete("/:id", async (ctx) => {
    const id = ctx.req.param("id");

    // Prevent deletion of main tenant
    if (config.accessControl && id === config.accessControl.mainTenantId) {
      throw new HTTPException(400, {
        message: "Cannot delete the main tenant",
      });
    }

    // Validate the user has access to this tenant via organization membership
    if (config.accessControl) {
      const user = ctx.var.user;
      if (!user?.sub) {
        throw new HTTPException(401, {
          message: "Authentication required to delete tenants",
        });
      }

      const mainTenantId = config.accessControl.mainTenantId;

      // Check if user is a member of the organization for this tenant
      const userOrgs =
        await ctx.env.data.userOrganizations.listUserOrganizations(
          mainTenantId,
          user.sub,
          {},
        );

      const hasAccess = userOrgs.organizations.some((org) => org.id === id);
      if (!hasAccess) {
        throw new HTTPException(403, {
          message: "Access denied to delete this tenant",
        });
      }
    }

    const existingTenant = await ctx.env.data.tenants.get(id);
    if (!existingTenant) {
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

    await ctx.env.data.tenants.remove(id);

    // Call afterDelete hook
    if (hooks.tenants?.afterDelete) {
      await hooks.tenants.afterDelete(hookCtx, id);
    }

    return ctx.body(null, 204);
  });

  return app;
}
