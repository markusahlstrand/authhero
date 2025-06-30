import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { Bindings, Variables, GrantFlowUserResult } from "../types";
import { AuthorizationResponseMode } from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";

export const refreshTokenParamsSchema = z.object({
  grant_type: z.literal("refresh_token"),
  client_id: z.string(),
  redirect_uri: z.string().optional(),
  refresh_token: z.string(),
});

export async function refreshTokenGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: z.infer<typeof refreshTokenParamsSchema>,
): Promise<GrantFlowUserResult> {
  const client = await ctx.env.data.clients.get(params.client_id);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }

  const refreshToken = await ctx.env.data.refreshTokens.get(
    client.tenant.id,
    params.refresh_token,
  );

  // These error codes should ne 400's according to the OAuth2 spec, but it seems auth0 uses 403's
  if (!refreshToken) {
    throw new HTTPException(403, {
      message: JSON.stringify({
        error: "invalid_grant",
        error_description: "Invalid refresh token",
      }),
    });
  } else if (
    (refreshToken.expires_at &&
      new Date(refreshToken.expires_at) < new Date()) ||
    (refreshToken.idle_expires_at &&
      new Date(refreshToken.idle_expires_at) < new Date())
  ) {
    throw new HTTPException(403, {
      message: JSON.stringify({
        error: "invalid_grant",
        error_description: "Refresh token has expired",
      }),
    });
  }

  const user = await ctx.env.data.users.get(
    client.tenant.id,
    refreshToken.user_id,
  );
  if (!user) {
    throw new HTTPException(403, { message: "User not found" });
  }

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
      client_id: client.id,
      audience: resourceServer?.audience,
      scope: resourceServer?.scopes,
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
    },
  };
}
