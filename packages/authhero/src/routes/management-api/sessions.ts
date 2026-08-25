import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { sessionSchema, LogTypes } from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { sendBackchannelLogout } from "../../helpers/backchannel-logout";
import { revokeSessionRefreshTokens } from "../../helpers/revoke-session-refresh-tokens";
import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
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
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    const session = await ctx.env.data.sessions.get(tenantId, id);

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
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    // Read before removing — the backchannel logout notification needs the
    // participating client ids, which are gone once the row is deleted.
    const session = await ctx.env.data.sessions.get(tenantId, id);

    // Cascade before the row goes: deleting a session is a deliberate "end
    // this access now", which Auth0 documents as revoking the session's
    // refresh tokens too. Without this the tokens keep minting access tokens
    // long after the session is gone.
    const revokedRefreshTokens = session
      ? await revokeSessionRefreshTokens(
          ctx.env.data,
          tenantId,
          session,
          new Date().toISOString(),
        )
      : 0;

    const result = await ctx.env.data.sessions.remove(tenantId, id);
    if (!result) {
      throw new HTTPException(404, {
        message: "Session not found",
      });
    }

    if (session) {
      sendBackchannelLogout(ctx, tenantId, session);
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: `Delete a Session (revoked ${revokedRefreshTokens} refresh token(s))`,
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
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    const session = await ctx.env.data.sessions.get(tenantId, id);
    const revokedAt = new Date().toISOString();

    const result = await ctx.env.data.sessions.update(tenantId, id, {
      revoked_at: revokedAt,
    });
    if (!result) {
      throw new HTTPException(404, {
        message: "Session not found",
      });
    }

    // "Revokes a session by ID and all associated refresh tokens" — the
    // session row alone leaves the tokens minting access tokens, since the
    // refresh grant checks only the token's own `revoked_at`.
    const revokedRefreshTokens = session
      ? await revokeSessionRefreshTokens(
          ctx.env.data,
          tenantId,
          session,
          revokedAt,
        )
      : 0;

    if (session) {
      sendBackchannelLogout(ctx, tenantId, session);
    }

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: `Revoke a Session (revoked ${revokedRefreshTokens} refresh token(s))`,
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
