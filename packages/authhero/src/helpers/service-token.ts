import { Context } from "hono";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { createAuthTokens } from "../authentication-flows/common";

const AUTH_SERVICE_CLIENT_ID = "auth-service";

export async function createServiceToken(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  scope: string,
  expiresInSeconds?: number,
  customClaims?: Record<string, unknown>,
) {
  const tenant = await ctx.env.data.tenants.get(tenant_id);
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenant_id}`);
  }

  const mockClient = {
    client_id: AUTH_SERVICE_CLIENT_ID,
    tenant,
    auth0_conformant: true,
  };

  const tokenResponse = await createAuthTokens(ctx, {
    client: mockClient,
    authParams: {
      client_id: AUTH_SERVICE_CLIENT_ID,
      response_type: AuthorizationResponseType.TOKEN,
      scope,
    },
    customClaims,
  });

  return {
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type,
    expires_in: expiresInSeconds || 3600, // Default 1 hour
  };
}
