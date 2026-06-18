import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  tenantInsertSchema,
  tenantSchema,
  auth0QuerySchema,
  CreateTenantParams,
  fetchAll,
  deepMergePatch,
} from "authhero";
import {
  MultiTenancyBindings,
  MultiTenancyVariables,
  MultiTenancyConfig,
  MultiTenancyHooks,
  TenantHookContext,
} from "../types";

/**
 * The subset of token claims we read off `ctx.var.user` to make tenant
 * authorization decisions. Parsed defensively with zod so we never reach for
 * `as` casts on the loosely-typed context variable.
 */
const callerClaimsSchema = z
  .object({
    sub: z.string(),
    tenant_id: z.string().optional(),
    org_id: z.string().optional(),
    scope: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  })
  .passthrough();

type CallerClaims = z.infer<typeof callerClaimsSchema>;

function parseCaller(user: unknown): CallerClaims | undefined {
  const result = callerClaimsSchema.safeParse(user);
  return result.success ? result.data : undefined;
}

/**
 * Whether the caller carries a scope/permission that grants tenant
 * administration across the control plane (i.e. without per-tenant
 * organization membership).
 *
 * `delete:tenants` is the scope the DELETE route declares in its OpenAPI
 * security; `admin:organizations` is the broader claim the list route already
 * treats as full access, kept here so create/list/delete stay symmetric.
 */
function callerHasGlobalTenantAdmin(caller: CallerClaims): boolean {
  const permissions = caller.permissions ?? [];
  const scopes = caller.scope ? caller.scope.split(" ").filter(Boolean) : [];
  const granted = new Set([...permissions, ...scopes]);
  return granted.has("delete:tenants") || granted.has("admin:organizations");
}

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
            org_id?: string;
          }
        | undefined;

      // If user has admin:organizations permission, allow access to all tenants.
      // Why: tokens with an org_id were issued for a specific organization, so any
      // admin:organizations permission they carry came from an org-scoped role — not a
      // global one — and must not bypass per-org tenant filtering.
      const userPermissions = user?.permissions || [];
      const tokenIsOrgScoped = Boolean(user?.org_id ?? ctx.var.organization_id);
      const hasFullAccess =
        !tokenIsOrgScoped && userPermissions.includes("admin:organizations");

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

      // When access control is enabled, a token without a subject must not
      // fall through to the global "return all tenants" path below — that
      // would bypass the per-organization filtering entirely. Reject instead.
      if (controlPlaneTenantId && !user?.sub) {
        throw new HTTPException(403, {
          message: "Access denied: token has no subject",
        });
      }

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
        const caller = parseCaller(ctx.var.user);

        if (!caller?.sub) {
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

        // Fast path: if the token was minted for this tenant's organization,
        // the auth flow already verified membership. Trust the claim.
        const tokenOrgName = ctx.var.org_name;
        const idLower = id.toLowerCase();
        let hasAccess =
          !!tokenOrgName && tokenOrgName.toLowerCase() === idLower;

        // Super-admin path: a non-org-scoped control-plane token carrying the
        // delete:tenants scope may delete any tenant without per-organization
        // membership. This keeps create and delete symmetric — a global admin
        // can create tenants without being added to their organizations (the
        // provisioning hook deliberately skips adding admin:organizations users
        // to per-tenant orgs), so they must also be able to delete them.
        // Mirrors the "full access" path on the list route. Org-scoped tokens
        // are excluded: their privileges came from an org-scoped role and must
        // not bypass per-organization filtering.
        if (!hasAccess) {
          const tokenIsOrgScoped = Boolean(
            caller.org_id ?? ctx.var.organization_id ?? tokenOrgName,
          );
          const isControlPlaneToken =
            !caller.tenant_id || caller.tenant_id === controlPlaneTenantId;
          if (
            !tokenIsOrgScoped &&
            isControlPlaneToken &&
            callerHasGlobalTenantAdmin(caller)
          ) {
            hasAccess = true;
          }
        }

        // Fallback: look up org memberships on the control plane. Covers
        // tokens issued without an org_name claim (e.g. legacy tokens).
        if (!hasAccess) {
          const userOrgs = await fetchAll<{ id: string; name: string }>(
            (params) =>
              ctx.env.data.userOrganizations.listUserOrganizations(
                controlPlaneTenantId,
                caller.sub,
                params,
              ),
            "organizations",
          );
          hasAccess = userOrgs.some(
            (org) => org.name?.toLowerCase() === idLower,
          );
        }

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

  // --------------------------------
  // GET /settings - Get current tenant settings
  // --------------------------------
  app.openapi(
    createRoute({
      tags: ["tenants", "settings"],
      method: "get",
      path: "/settings",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:tenants"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: tenantSchema,
            },
          },
          description: "Current tenant settings",
        },
      },
    }),
    async (ctx) => {
      const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);

      if (!tenant) {
        throw new HTTPException(404, {
          message: "Tenant not found",
        });
      }

      return ctx.json(tenant);
    },
  );

  // --------------------------------
  // PATCH /settings - Update current tenant settings
  // --------------------------------
  app.openapi(
    createRoute({
      tags: ["tenants", "settings"],
      method: "patch",
      path: "/settings",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
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
          description: "Updated tenant settings",
        },
      },
    }),
    async (ctx) => {
      const updates = ctx.req.valid("json");

      // Strip protected system fields that should not be modified
      const { id, ...sanitizedUpdates } = updates;

      // Get existing tenant
      const existingTenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);

      if (!existingTenant) {
        throw new HTTPException(404, {
          message: "Tenant not found",
        });
      }

      // Deep merge with updates to preserve nested object properties
      const mergedTenant = deepMergePatch(existingTenant, sanitizedUpdates);

      await ctx.env.data.tenants.update(ctx.var.tenant_id, mergedTenant);

      // Return the updated tenant
      const updatedTenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);

      if (!updatedTenant) {
        throw new HTTPException(500, {
          message: "Failed to retrieve updated tenant",
        });
      }

      return ctx.json(updatedTenant);
    },
  );

  return app;
}
