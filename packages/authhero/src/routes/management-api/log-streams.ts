import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  logStreamInsertSchema,
  logStreamSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";

import { defineRoute } from "../../utils/define-route";
function getAdapter(ctx: { env: Bindings }) {
  const adapter = ctx.env.data.logStreams;
  if (!adapter) {
    throw new HTTPException(501, {
      message: "Log streams are not supported by this adapter",
    });
  }
  return adapter;
}
const getRoot = defineRoute({
  route: createRoute({
      tags: ["log-streams"],
      method: "get",
      path: "/",
      request: {
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:log_streams"] }],
      responses: {
        200: {
          content: {
            "application/json": { schema: z.array(logStreamSchema) },
          },
          description: "List of log streams",
        },
      },
    }),
  handler: async (ctx) => {
      const adapter = getAdapter(ctx);
      const result = await adapter.list(ctx.var.tenant_id);
      return ctx.json(result);
    },
});

const getById = defineRoute({
  route: createRoute({
      tags: ["log-streams"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({ id: z.string() }),
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:log_streams"] }],
      responses: {
        200: {
          content: { "application/json": { schema: logStreamSchema } },
          description: "A log stream",
        },
      },
    }),
  handler: async (ctx) => {
      const adapter = getAdapter(ctx);
      const { id } = ctx.req.valid("param");
      const stream = await adapter.get(ctx.var.tenant_id, id);
      if (!stream) {
        throw new HTTPException(404);
      }
      return ctx.json(stream);
    },
});

const postRoot = defineRoute({
  route: createRoute({
      tags: ["log-streams"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(logStreamInsertSchema.shape),
            },
          },
        },
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["create:log_streams"] }],
      responses: {
        201: {
          content: { "application/json": { schema: logStreamSchema } },
          description: "The created log stream",
        },
      },
    }),
  handler: async (ctx) => {
      const adapter = getAdapter(ctx);
      const body = ctx.req.valid("json");
      const stream = await adapter.create(ctx.var.tenant_id, body);

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Create a Log Stream",
        targetType: "log_stream",
        targetId: stream.id,
        afterState: stream as Record<string, unknown>,
      });

      return ctx.json(stream, { status: 201 });
    },
});

const patchById = defineRoute({
  route: createRoute({
      tags: ["log-streams"],
      method: "patch",
      path: "/{id}",
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            "application/json": {
              schema: z.object(logStreamSchema.shape).partial(),
            },
          },
        },
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["update:log_streams"] }],
      responses: {
        200: {
          content: { "application/json": { schema: logStreamSchema } },
          description: "The updated log stream",
        },
      },
    }),
  handler: async (ctx) => {
      const adapter = getAdapter(ctx);
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const ok = await adapter.update(ctx.var.tenant_id, id, body);
      if (!ok) {
        throw new HTTPException(404);
      }
      const stream = await adapter.get(ctx.var.tenant_id, id);
      if (!stream) {
        throw new HTTPException(404);
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update a Log Stream",
        targetType: "log_stream",
        targetId: id,
        afterState: stream as Record<string, unknown>,
      });

      return ctx.json(stream);
    },
});

const deleteById = defineRoute({
  route: createRoute({
      tags: ["log-streams"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({ id: z.string() }),
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["delete:log_streams"] }],
      responses: {
        204: { description: "Log stream deleted" },
      },
    }),
  handler: async (ctx) => {
      const adapter = getAdapter(ctx);
      const { id } = ctx.req.valid("param");
      const ok = await adapter.remove(ctx.var.tenant_id, id);
      if (!ok) {
        throw new HTTPException(404);
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete a Log Stream",
        targetType: "log_stream",
        targetId: id,
      });

      return ctx.body(null, 204);
    },
});


export const logStreamsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  .openapiRoutes([getRoot, getById, postRoot, patchById, deleteById] as const);
