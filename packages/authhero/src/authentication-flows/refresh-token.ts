import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { createAuthResponse } from "./common";
import { Bindings, Variables } from "../types";
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
) {
  const client = await ctx.env.data.clients.get(params.client_id);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }

  const refreshToken = await ctx.env.data.refreshTokens.get(
    client.tenant.id,
    params.refresh_token,
  );

  if (!refreshToken) {
    throw new HTTPException(403, { message: "Invalid refresh token" });
  } else if (
    refreshToken.expires_at &&
    new Date(refreshToken.expires_at) < new Date()
  ) {
    throw new HTTPException(403, { message: "Refresh token expired" });
  }

  const session = await ctx.env.data.sessions.get(
    client.tenant.id,
    refreshToken.session_id,
  );
  if (!session) {
    throw new HTTPException(403, { message: "Session not found" });
  }

  const user = await ctx.env.data.users.get(client.tenant.id, session.user_id);
  if (!user) {
    throw new HTTPException(403, { message: "User not found" });
  }

  const resourceServer = refreshToken.resource_servers[0];

  return createAuthResponse(ctx, {
    user,
    client,
    refreshToken: refreshToken.token,
    sessionId: session.id,
    authParams: {
      client_id: client.id,
      audience: resourceServer?.audience,
      scope: resourceServer?.scopes,
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
    },
  });
}
