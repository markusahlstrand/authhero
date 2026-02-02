import { JSONHTTPException } from "../errors/json-http-exception";
import { Context } from "hono";
import { Bindings, Variables, GrantFlowUserResult } from "../types";
import { AuthorizationResponseMode } from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { safeCompare } from "../utils/safe-compare";
import { appendLog } from "../utils/append-log";
import { getEnrichedClient } from "../helpers/client";

export const refreshTokenParamsSchema = z.object({
  grant_type: z.literal("refresh_token"),
  client_id: z.string(),
  redirect_uri: z.string().optional(),
  refresh_token: z.string(),
  client_secret: z.string().optional(),
});

export async function refreshTokenGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: z.infer<typeof refreshTokenParamsSchema>,
): Promise<GrantFlowUserResult> {
  const client = await getEnrichedClient(
    ctx.env,
    params.client_id,
    ctx.var.tenant_id,
  );

  // Validate client_secret if provided
  if (params.client_secret) {
    if (
      client.client_secret &&
      !safeCompare(client.client_secret, params.client_secret)
    ) {
      throw new JSONHTTPException(403, {
        error: "invalid_client",
        error_description: "Client authentication failed",
      });
    }
  }

  const refreshToken = await ctx.env.data.refreshTokens.get(
    client.tenant.id,
    params.refresh_token,
  );

  if (!refreshToken) {
    appendLog(ctx, `Invalid refresh token: ${params.refresh_token}`);
    throw new JSONHTTPException(400, {
      error: "invalid_grant",
      error_description: "Invalid refresh token",
    });
  } else if (
    (refreshToken.expires_at &&
      new Date(refreshToken.expires_at) < new Date()) ||
    (refreshToken.idle_expires_at &&
      new Date(refreshToken.idle_expires_at) < new Date())
  ) {
    appendLog(ctx, `Refresh token has expired: ${params.refresh_token}`);
    throw new JSONHTTPException(400, {
      error: "invalid_grant",
      error_description: "Refresh token has expired",
    });
  }

  const user = await ctx.env.data.users.get(
    client.tenant.id,
    refreshToken.user_id,
  );
  if (!user) {
    throw new JSONHTTPException(403, { message: "User not found" });
  }

  ctx.set("user_id", user.user_id);

  const resourceServer = refreshToken.resource_servers[0];

  // Update the idle_expires_at
  if (refreshToken.idle_expires_at) {
    const idleExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    );
    await ctx.env.data.refreshTokens.update(client.tenant.id, refreshToken.id, {
      idle_expires_at: idleExpiresAt.toISOString(),
      last_exchanged_at: new Date().toISOString(),
      device: {
        ...refreshToken.device,
        last_ip: ctx.req.header["x-real-ip"] || "",
        last_user_agent: ctx.req.header["user-agent"] || "",
      },
    });
  }

  return {
    user,
    client,
    refresh_token: refreshToken.id,
    session_id: refreshToken.session_id,
    authParams: {
      client_id: client.client_id,
      audience: resourceServer?.audience,
      scope: resourceServer?.scopes,
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
    },
  };
}
