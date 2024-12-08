import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { AuthParams } from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { createAuthTokens } from "./common";
import { Bindings, Variables } from "../types";

export const clientCredentialGrantParamsSchema = z.object({
  grant_type: z.literal("client_credentials"),
  scope: z.string().optional(),
  client_secret: z.string(),
  client_id: z.string(),
  audience: z.string().optional(),
});

export async function clientCredentialsGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: z.infer<typeof clientCredentialGrantParamsSchema>,
) {
  const client = await ctx.env.data.clients.get(params.client_id);

  if (!client) {
    throw new HTTPException(403, { message: "Invalid client" });
  }

  if (client.client_secret !== params.client_secret) {
    throw new HTTPException(403, { message: "Invalid secret" });
  }

  const authParams: AuthParams = {
    client_id: client.id,
    scope: params.scope,
    audience: params.audience,
  };

  return createAuthTokens(ctx, { authParams });
}
