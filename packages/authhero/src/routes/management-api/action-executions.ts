import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  actionExecutionLogsSchema,
  actionExecutionResultSchema,
  actionExecutionStatusSchema,
} from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
// Public response shape mirrors Auth0 (no internal fields like tenant_id or
// captured console logs). See:
// https://auth0.com/docs/api/management/v2/actions/get-execution
const auth0ActionExecutionResponseSchema = z.object({
  id: z.string(),
  trigger_id: z.string(),
  status: actionExecutionStatusSchema,
  results: z.array(actionExecutionResultSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

const executionLogsResponseSchema = z.object({
  logs: actionExecutionLogsSchema,
});
const getById = defineRoute({
  route: createRoute({
    tags: ["actions"],
    method: "get",
    path: "/{id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({ id: z.string() }),
    },
    security: [{ Bearer: ["read:actions"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: auth0ActionExecutionResponseSchema,
          },
        },
        description: "Action execution",
      },
      404: { description: "Execution not found" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    const execution = await ctx.env.data.actionExecutions.get(tenantId, id);
    if (!execution) {
      throw new HTTPException(404, { message: "Execution not found" });
    }
    return ctx.json({
      id: execution.id,
      trigger_id: execution.trigger_id,
      status: execution.status,
      results: execution.results,
      created_at: execution.created_at,
      updated_at: execution.updated_at,
    });
  },
});

const getByIdLogs = defineRoute({
  route: createRoute({
    tags: ["actions"],
    method: "get",
    path: "/{id}/logs",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({ id: z.string() }),
    },
    security: [{ Bearer: ["read:actions"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: executionLogsResponseSchema,
          },
        },
        description: "Captured console output for the execution",
      },
      404: { description: "Execution not found" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    const execution = await ctx.env.data.actionExecutions.get(tenantId, id);
    if (!execution) {
      throw new HTTPException(404, { message: "Execution not found" });
    }
    return ctx.json({ logs: execution.logs ?? [] });
  },
});

export const actionExecutionsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getById, getByIdLogs] as const);
