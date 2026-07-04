import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  LogTypes,
  tenantOperationEventSchema,
  tenantOperationKindSchema,
  tenantOperationSchema,
  tenantOperationStatusSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { defineRoute } from "../../utils/define-route";
import { logMessage } from "../../helpers/logging";
import { isControlPlaneTenant } from "./tenants";

// Durable tenant lifecycle operations (issue #1026). These are
// control-plane records: the routes are only mounted when the management
// adapter carries the tenantOperations/tenantOperationEvents adapters,
// which only control-plane deployments wire up.

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
  kind: tenantOperationKindSchema.optional(),
  status: tenantOperationStatusSchema.optional(),
});

// GET /operations/{id} — one operation plus its full event timeline.
const getOperation = defineRoute({
  route: createRoute({
    tags: ["tenant-operations"],
    method: "get",
    path: "/{id}",
    request: {
      params: z.object({ id: z.string() }),
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["read:tenant_operations"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: tenantOperationSchema.extend({
              events: z.array(tenantOperationEventSchema),
            }),
          },
        },
        description: "The operation with its step events",
      },
    },
  }),
  handler: async (ctx) => {
    const { tenantOperations, tenantOperationEvents } = ctx.env.data;
    if (!tenantOperations || !tenantOperationEvents) {
      throw new HTTPException(501, {
        message: "Tenant operations are not configured for this deployment",
      });
    }

    const { id } = ctx.req.valid("param");
    const operation = await tenantOperations.get(id);
    if (!operation) {
      throw new HTTPException(404, { message: "Operation not found" });
    }

    const { events } = await tenantOperationEvents.listByOperation(id);
    return ctx.json({ ...operation, events });
  },
});

export const operationRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getOperation] as const);

// GET /tenants/:id/operations — paginated history for one tenant. The
// target tenant id comes from the mount path (like
// /users/:user_id/authentication-methods).
const listTenantOperations = defineRoute({
  route: createRoute({
    tags: ["tenant-operations"],
    method: "get",
    path: "/",
    request: {
      query: listQuerySchema,
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["read:tenant_operations"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              operations: z.array(tenantOperationSchema),
              start: z.number(),
              limit: z.number(),
              length: z.number(),
            }),
          },
        },
        description: "Operations for the tenant, newest first",
      },
    },
  }),
  handler: async (ctx) => {
    const { tenantOperations } = ctx.env.data;
    if (!tenantOperations) {
      throw new HTTPException(501, {
        message: "Tenant operations are not configured for this deployment",
      });
    }

    const tenantId = ctx.req.param("id");
    if (!tenantId) {
      throw new HTTPException(400, { message: "Missing tenant id" });
    }
    const { page, per_page, kind, status } = ctx.req.valid("query");

    const result = await tenantOperations.list({
      tenant_id: tenantId,
      page,
      per_page,
      kind,
      status,
    });

    return ctx.json(result);
  },
});

// POST /tenants/:id/operations — enqueue an operation for a tenant.
// Control-plane only, mirroring POST /tenants/{id}/redeploy. Phase 1
// supports { kind: "upgrade" } via the configured executor; provision and
// deprovision stay lifecycle-hook driven, seed and backup arrive with the
// durable executor phases.
const createTenantOperation = defineRoute({
  route: createRoute({
    tags: ["tenant-operations"],
    method: "post",
    path: "/",
    request: {
      headers: z.object({ "tenant-id": z.string().optional() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({ kind: tenantOperationKindSchema }),
          },
        },
      },
    },
    security: [{ Bearer: ["create:tenant_operations"] }],
    responses: {
      201: {
        content: {
          "application/json": { schema: tenantOperationSchema },
        },
        description:
          "The enqueued operation. Poll GET /operations/{id} for progress; the inline engine returns it already terminal.",
      },
    },
  }),
  handler: async (ctx) => {
    if (!isControlPlaneTenant(ctx, ctx.var.tenant_id)) {
      throw new HTTPException(403, {
        message:
          "Tenant operations can only be triggered from the control plane",
      });
    }

    const { kind } = ctx.req.valid("json");
    const tenantId = ctx.req.param("id");
    if (!tenantId) {
      throw new HTTPException(400, { message: "Missing tenant id" });
    }

    const tenant = await ctx.env.data.tenants.get(tenantId);
    if (!tenant) {
      throw new HTTPException(404, { message: "Tenant not found" });
    }

    if (kind === "provision" || kind === "deprovision") {
      throw new HTTPException(400, {
        message: `Operations of kind "${kind}" are managed by the tenant lifecycle (create/delete) and cannot be enqueued directly`,
      });
    }

    if (kind === "seed" || kind === "backup") {
      throw new HTTPException(501, {
        message: `Operations of kind "${kind}" are not supported yet`,
      });
    }

    const executor = ctx.env.tenantOperationExecutor;
    if (!executor) {
      throw new HTTPException(501, {
        message:
          "Tenant operations are not configured for this deployment (no executor)",
      });
    }

    const operation = await executor.enqueue({
      kind,
      tenant_id: tenantId,
      initiated_by: ctx.var.user?.sub,
    });

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: `Enqueue tenant operation (${kind})`,
      targetType: "tenant",
      targetId: tenantId,
    });

    return ctx.json(operation, { status: 201 });
  },
});

export const tenantOperationsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([listTenantOperations, createTenantOperation] as const);
