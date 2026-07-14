import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
import {
  flowInsertSchema,
  flowSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { parseSort } from "../../utils/sort";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId, withTotals, listResponse } from "./helpers";
const flowsWithTotalsSchema = withTotals({
  flows: z.array(flowSchema),
});
const getRoot = defineRoute({
  route: createRoute({
    tags: ["flows"],
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
        Bearer: ["read:flows"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([z.array(flowSchema), flowsWithTotalsSchema]),
          },
        },
        description: "List of flows",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const {
      page,
      per_page,
      include_totals = false,
      sort,
      q,
    } = ctx.req.valid("query");

    const result = await ctx.env.data.flows.list(tenant_id, {
      page,
      per_page,
      include_totals,
      sort: parseSort(sort),
      q,
    });

    return ctx.json(listResponse(include_totals, result, "flows"));
  },
});

const getById = defineRoute({
  route: createRoute({
    tags: ["flows"],
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
        Bearer: ["read:flows"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: flowSchema,
          },
        },
        description: "A flow",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    const flow = await ctx.env.data.flows.get(tenant_id, id);
    if (!flow) {
      throw new HTTPException(404);
    }

    return ctx.json(flow);
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["flows"],
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
        Bearer: ["delete:flows"],
      },
    ],
    responses: {
      200: {
        description: "Status",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    const result = await ctx.env.data.flows.remove(tenant_id, id);
    if (!result) {
      throw new HTTPException(404, {
        message: "Flow not found",
      });
    }

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete a Flow",
      targetType: "flow",
      targetId: id,
    });

    return ctx.text("OK");
  },
});

const patchById = defineRoute({
  route: createRoute({
    tags: ["flows"],
    method: "patch",
    path: "/{id}",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object(flowInsertSchema.shape).partial(),
          },
        },
      },
      params: z.object({
        id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["update:flows"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: flowSchema,
          },
        },
        description: "The updated flow",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const flow = await ctx.env.data.flows.update(tenant_id, id, body);
    if (!flow) {
      throw new HTTPException(404, {
        message: "Flow not found",
      });
    }

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update a Flow",
      targetType: "flow",
      targetId: id,
      afterState: flow as Record<string, unknown>,
    });

    return ctx.json(flow);
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["flows"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object(flowInsertSchema.shape),
          },
        },
      },
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["create:flows"],
      },
    ],
    responses: {
      201: {
        content: {
          "application/json": {
            schema: flowSchema,
          },
        },
        description: "The created flow",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const body = ctx.req.valid("json");

    const flow = await ctx.env.data.flows.create(tenant_id, body);

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create a Flow",
      targetType: "flow",
      targetId: flow.id,
      afterState: flow as Record<string, unknown>,
    });

    return ctx.json(flow, { status: 201 });
  },
});

export const flowsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getRoot,
  getById,
  deleteById,
  patchById,
  postRoot,
] as const);
