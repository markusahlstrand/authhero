import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import {
  refreshTokenInsertSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { defineRoute } from "../../utils/define-route";
const getById = defineRoute({
  route: createRoute({
    tags: ["refresh_tokens"],
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
        Bearer: ["read:refresh_tokens"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: refreshTokenInsertSchema,
          },
        },
        description: "A session",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");

    const session = await ctx.env.data.refreshTokens.get(ctx.var.tenant_id, id);

    if (!session) {
      throw new HTTPException(404);
    }

    return ctx.json(session);
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["refresh_tokens"],
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
        Bearer: ["delete:refresh_tokens"],
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

    // Resolve the row first so we know its family. Removing a refresh token
    // via the admin API also revokes any sibling/descendant tokens in the
    // same rotation chain — matches the user-stated expectation that
    // "revoke" should torch the entire family.
    //
    // Run revokeFamily *before* the hard remove: revokeFamily is
    // idempotent ("WHERE revoked_at_ts IS NULL"), so if the subsequent
    // remove fails the family is already torched and a retry just
    // re-runs remove. The reverse order would leave siblings active if
    // the family-revoke step failed after the parent was already gone.
    const target = await ctx.env.data.refreshTokens.get(ctx.var.tenant_id, id);

    const familyId = target?.family_id ?? target?.id;
    if (familyId) {
      await ctx.env.data.refreshTokens.revokeFamily(
        ctx.var.tenant_id,
        familyId,
        new Date().toISOString(),
      );
    }

    const result = await ctx.env.data.refreshTokens.remove(
      ctx.var.tenant_id,
      id,
    );
    if (!result) {
      throw new HTTPException(404, {
        message: "Session not found",
      });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete a Refresh Token",
      targetType: "refresh_token",
      targetId: id,
    });

    return ctx.text("OK");
  },
});

export const refreshTokensRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getById, deleteById] as const);
