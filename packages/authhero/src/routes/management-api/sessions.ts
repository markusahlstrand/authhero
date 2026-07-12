import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { sessionSchema, LogTypes } from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { sendBackchannelLogout } from "../../helpers/backchannel-logout";
import { defineRoute } from "../../utils/define-route";
const getById = defineRoute({
  route: createRoute({
    tags: ["sessions"],
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
        Bearer: ["read:sessions"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: sessionSchema,
          },
        },
        description: "A session",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");

    const session = await ctx.env.data.sessions.get(ctx.var.tenant_id, id);

    if (!session) {
      throw new HTTPException(404);
    }

    return ctx.json(session);
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["sessions"],
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
        Bearer: ["delete:sessions"],
      },
    ],
    responses: {
      200: {
        description: "Status",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");

    // Read before removing — the backchannel logout notification needs the
    // participating client ids, which are gone once the row is deleted.
    const session = await ctx.env.data.sessions.get(ctx.var.tenant_id, id);

    const result = await ctx.env.data.sessions.remove(ctx.var.tenant_id, id);
    if (!result) {
      throw new HTTPException(404, {
        message: "Session not found",
      });
    }

    if (session) {
      sendBackchannelLogout(ctx, ctx.var.tenant_id, session);
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete a Session",
      targetType: "session",
      targetId: id,
    });

    return ctx.text("OK");
  },
});

const postByIdRevoke = defineRoute({
  route: createRoute({
    tags: ["sessions"],
    method: "post",
    path: "/{id}/revoke",
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
        Bearer: ["update:sessions"],
      },
    ],
    responses: {
      202: {
        description: "Session deletion status",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");

    const session = await ctx.env.data.sessions.get(ctx.var.tenant_id, id);

    const result = await ctx.env.data.sessions.update(ctx.var.tenant_id, id, {
      revoked_at: new Date().toISOString(),
    });
    if (!result) {
      throw new HTTPException(404, {
        message: "Session not found",
      });
    }

    if (session) {
      sendBackchannelLogout(ctx, ctx.var.tenant_id, session);
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Revoke a Session",
      targetType: "session",
      targetId: id,
    });

    return ctx.text("Session deletion request accepted.", { status: 202 });
  },
});

export const sessionsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getById, deleteById, postByIdRevoke] as const);
