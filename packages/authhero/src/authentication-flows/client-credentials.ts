import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import { AuthParams } from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { createAuthTokens } from "./common";
import { Bindings, Variables } from "../types";
import { safeCompare } from "../utils/safe-compare";

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
    throw new HTTPException(403, { message: "Invalid client credentials" });
  }

  if (
    client.client_secret &&
    !safeCompare(client.client_secret, params.client_secret)
  ) {
    throw new HTTPException(403, { message: "Invalid client credentials" });
  }

  const authParams: AuthParams = {
    client_id: client.id,
    scope: params.scope,
    audience: params.audience,
  };

  const tokens = await createAuthTokens(ctx, { authParams, client });
  return ctx.json(tokens);
}
