import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import {
  AuthParams,
  ClientCredentialsGrantTypeParams,
} from "@authhero/adapter-interfaces";
import { createAuthTokens } from "./common";

export async function clientCredentialsGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: ClientCredentialsGrantTypeParams,
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

  return createAuthTokens(ctx, authParams, client.id);
}
