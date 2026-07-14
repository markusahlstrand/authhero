import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import {
  tenantInsertSchema,
  tenantSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { deepMergePatch } from "../../utils/deep-merge";
import { logMessage } from "../../helpers/logging";
import { defineRoute } from "../../utils/define-route";
import { isInteractiveClient } from "../../helpers/provision-tenant-clients";
import { requireTenantId } from "./helpers";
const getSettings = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const tenant = await ctx.env.data.tenants.get(tenant_id);

    if (!tenant) {
      throw new HTTPException(404, {
        message: "Tenant not found",
      });
    }

    return ctx.json({
      ...tenant,
      is_control_plane: isControlPlaneTenant(ctx, tenant_id),
    });
  },
});

const patchSettings = defineRoute({
  route: createRoute({
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
            // `database_version` tracks the schema migration the tenant's
            // deployed bundle targets — it's reconciled by the provisioner,
            // not something a client may set. Omit it from the externally
            // patchable settings so it can't be written through patchSettings.
            schema: z
              .object(tenantInsertSchema.shape)
              .omit({ database_version: true })
              .partial(),
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
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const updates = ctx.req.valid("json");

    // Strip protected system fields that should not be modified
    const { id, ...sanitizedUpdates } = updates;

    // Get existing tenant
    const existingTenant = await ctx.env.data.tenants.get(tenant_id);

    if (!existingTenant) {
      throw new HTTPException(404, {
        message: "Tenant not found",
      });
    }

    // Only validate default_audience when the field is in the incoming
    // payload — leaves grandfathered tenants able to PATCH unrelated fields.
    if ("default_audience" in sanitizedUpdates) {
      const next = sanitizedUpdates.default_audience;
      if (typeof next === "string" && next.length > 0) {
        const { resource_servers } =
          await ctx.env.data.resourceServers.list(tenant_id);
        const exists = resource_servers.some((rs) => rs.identifier === next);
        if (!exists) {
          throw new HTTPException(400, {
            message: `Resource server with identifier '${next}' not found`,
          });
        }
      }
    }

    // The default client anchors interactive tenant-level flows (e.g. the DCR
    // /connect/start consent bounce), so it must reference an existing,
    // interactive client — never an M2M/client_credentials client (#1007).
    if ("default_client_id" in sanitizedUpdates) {
      const next = sanitizedUpdates.default_client_id;
      if (typeof next === "string" && next.length > 0) {
        const client = await ctx.env.data.clients.get(tenant_id, next);
        if (!client) {
          throw new HTTPException(400, {
            message: `Client with id '${next}' not found`,
          });
        }
        if (!isInteractiveClient(client)) {
          throw new HTTPException(400, {
            message: `Client '${next}' is not an interactive client and cannot be used as the default client`,
          });
        }
      }
    }

    // Deep merge with updates to preserve nested object properties
    // Note: created_at and updated_at are not in the update payload, they're only in the full tenant schema
    const mergedTenant = deepMergePatch(existingTenant, sanitizedUpdates);

    await ctx.env.data.tenants.update(tenant_id, mergedTenant);

    // Return the updated tenant
    const updatedTenant = await ctx.env.data.tenants.get(tenant_id);

    if (!updatedTenant) {
      throw new HTTPException(500, {
        message: "Failed to retrieve updated tenant",
      });
    }

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update tenant settings",
      targetType: "tenant",
      targetId: tenant_id,
      beforeState: existingTenant as Record<string, unknown>,
      afterState: updatedTenant as Record<string, unknown>,
    });

    return ctx.json({
      ...updatedTenant,
      is_control_plane: isControlPlaneTenant(ctx, tenant_id),
    });
  },
});

// Re-provision ("upgrade") a WFP tenant onto the control plane's current
// worker bundle + migrations. Control-plane-only: the acting tenant (resolved
// from the `tenant-id` header) must be the control plane — which both scopes
// the operation to operators and guarantees `tenantDispatch` did not forward
// this request to a tenant worker (it never forwards control-plane traffic).
// The target tenant is named by the `{id}` path param. Drives
// `config.tenantUpgrade`; returns 501 when no upgrade handler is configured.
const redeployTenant = defineRoute({
  route: createRoute({
    tags: ["tenants"],
    method: "post",
    path: "/{id}/redeploy",
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
        description: "Upgraded tenant settings",
      },
    },
  }),
  handler: async (ctx) => {
    if (!isControlPlaneTenant(ctx, ctx.var.tenant_id)) {
      throw new HTTPException(403, {
        message: "Tenant upgrades can only be triggered from the control plane",
      });
    }

    if (!ctx.env.tenantUpgrade) {
      throw new HTTPException(501, {
        message: "Tenant upgrades are not configured for this deployment",
      });
    }

    const { id } = ctx.req.valid("param");

    const existingTenant = await ctx.env.data.tenants.get(id);
    if (!existingTenant) {
      throw new HTTPException(404, {
        message: "Tenant not found",
      });
    }

    // Only WFP-provisioned tenants have their own worker/D1 to redeploy. A
    // shared tenant has nothing to upgrade and would otherwise fail deeper in
    // the provisioning hook — reject it here with a clear client error.
    if (existingTenant.deployment_type !== "wfp") {
      throw new HTTPException(400, {
        message: "Only WFP-provisioned tenants can be redeployed",
      });
    }

    try {
      await ctx.env.tenantUpgrade(id);
    } catch (err) {
      console.error("Tenant upgrade failed", { tenantId: id, err });
      throw new HTTPException(500, {
        message: "Tenant upgrade failed",
      });
    }

    const upgradedTenant = await ctx.env.data.tenants.get(id);
    if (!upgradedTenant) {
      throw new HTTPException(500, {
        message: "Failed to retrieve upgraded tenant",
      });
    }

    await logMessage(ctx, id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Redeploy tenant",
      targetType: "tenant",
      targetId: id,
      beforeState: existingTenant as Record<string, unknown>,
      afterState: upgradedTenant as Record<string, unknown>,
    });

    return ctx.json({
      ...upgradedTenant,
      is_control_plane: isControlPlaneTenant(ctx, id),
    });
  },
});

export const tenantRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getSettings, patchSettings, redeployTenant] as const);

// True when the current tenant is the deployment's control plane. In
// multi-tenant deployments `multiTenancyConfig.controlPlaneTenantId` names the
// designated tenant; when no config is set we treat the deployment as
// single-tenant, which is effectively a control plane.
export function isControlPlaneTenant(
  ctx: {
    env: { data: { multiTenancyConfig?: { controlPlaneTenantId?: string } } };
  },
  tenantId: string,
): boolean {
  const cpId = ctx.env.data.multiTenancyConfig?.controlPlaneTenantId;
  if (!cpId) return true;
  return cpId === tenantId;
}
