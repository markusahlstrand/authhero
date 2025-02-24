import { Context } from "hono";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { createAuthTokens } from "../authentication-flows/common";

export async function createServiceToken(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  scope: string,
) {
  const tenant = await ctx.env.data.tenants.get(tenant_id);
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenant_id}`);
  }

  return createAuthTokens(ctx, {
    client: {
      id: ctx.env.ISSUER,
      tenant,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      name: ctx.env.ISSUER,
      disable_sign_ups: false,
      connections: [],
    },
    authParams: {
      client_id: ctx.env.ISSUER,
      response_type: AuthorizationResponseType.TOKEN,
      scope,
    },
  });
}
