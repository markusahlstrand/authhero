import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  tenantInsertSchema,
  auth0QuerySchema,
} from "@authhero/adapter-interfaces";
import {
  MultiTenancyBindings,
  MultiTenancyVariables,
  MultiTenancyConfig,
  MultiTenancyHooks,
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
  // GET /tenants - List all tenants
  // --------------------------------
  app.get("/", async (ctx) => {
    // Validate access to main tenant
    if (config.accessControl) {
      const canAccess = await hooks.onTenantAccessValidation?.(
        ctx,
        config.accessControl.mainTenantId,
      );
      if (canAccess === false) {
        throw new HTTPException(403, {
          message: "Access denied to tenant management",
        });
      }
    }

    const query = auth0QuerySchema.parse(ctx.req.query());
    const { page, per_page, include_totals, q } = query;

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

    // Validate access
    const canAccess = await hooks.onTenantAccessValidation?.(ctx, id);
    if (canAccess === false) {
      throw new HTTPException(403, {
        message: "Access denied to this tenant",
      });
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
  app.post("/", async (ctx) => {
    try {
      // Validate access to main tenant for creating new tenants
      if (config.accessControl) {
        const canAccess = await hooks.onTenantAccessValidation?.(
          ctx,
          config.accessControl.mainTenantId,
        );
        if (canAccess === false) {
          throw new HTTPException(403, {
            message: "Access denied to create tenants",
          });
        }
      }

      const body = tenantInsertSchema.parse(await ctx.req.json());

      // Create the tenant
      const tenant = await ctx.env.data.tenants.create(body);

      // Run post-creation hooks (org creation, db provisioning, etc.)
      if (hooks.onTenantCreated) {
        await hooks.onTenantCreated(ctx, tenant);
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

    // Validate access
    const canAccess = await hooks.onTenantAccessValidation?.(ctx, id);
    if (canAccess === false) {
      throw new HTTPException(403, {
        message: "Access denied to update this tenant",
      });
    }

    const body = tenantInsertSchema.partial().parse(await ctx.req.json());

    // Strip protected fields
    const { id: _, ...updates } = body as { id?: string };

    const existingTenant = await ctx.env.data.tenants.get(id);
    if (!existingTenant) {
      throw new HTTPException(404, {
        message: "Tenant not found",
      });
    }

    await ctx.env.data.tenants.update(id, updates);

    const updatedTenant = await ctx.env.data.tenants.get(id);
    if (!updatedTenant) {
      throw new HTTPException(404, {
        message: "Tenant not found after update",
      });
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

    // Validate access to main tenant for deleting tenants
    if (config.accessControl) {
      const canAccess = await hooks.onTenantAccessValidation?.(
        ctx,
        config.accessControl.mainTenantId,
      );
      if (canAccess === false) {
        throw new HTTPException(403, {
          message: "Access denied to delete tenants",
        });
      }
    }

    const existingTenant = await ctx.env.data.tenants.get(id);
    if (!existingTenant) {
      throw new HTTPException(404, {
        message: "Tenant not found",
      });
    }

    // Run pre-deletion hooks (org removal, db deprovisioning, etc.)
    if (hooks.onTenantDeleting) {
      await hooks.onTenantDeleting(ctx, id);
    }

    await ctx.env.data.tenants.remove(id);

    return ctx.body(null, 204);
  });

  return app;
}
