import { Context } from "hono";
import {
  AuthorizationResponseType,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "./client";
import { Bindings, Variables } from "../types";
import { createAuthTokens } from "../authentication-flows/common";

const AUTH_SERVICE_CLIENT_ID = "auth-service";

export async function createServiceToken(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  scope: string,
  expiresInSeconds?: number,
) {
  const tenant = await ctx.env.data.tenants.get(tenant_id);
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenant_id}`);
  }

  // Create a mock EnrichedClient for service tokens
  // Using hardcoded AUTH_SERVICE_CLIENT_ID to prevent spoofing
  const mockClient: EnrichedClient = {
    client_id: AUTH_SERVICE_CLIENT_ID,
    tenant,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: "Auth Service",
    global: false,
    is_first_party: true, // Mark as first party
    oidc_conformant: false,
    auth0_conformant: true,
    sso: false,
    sso_disabled: false,
    cross_origin_authentication: false,
    custom_login_page_on: false,
    require_pushed_authorization_requests: false,
    require_proof_of_possession: false,
    client_metadata: {
      disable_sign_ups: "false",
      email_validation: "disabled",
    },
    // Legacy fields extracted from metadata
    disable_sign_ups: false,
    email_validation: "disabled",
    connections: [],
  } as EnrichedClient;

  const tokenResponse = await createAuthTokens(ctx, {
    client: mockClient,
    authParams: {
      client_id: AUTH_SERVICE_CLIENT_ID,
      response_type: AuthorizationResponseType.TOKEN,
      scope,
    },
  });

  return {
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type,
    expires_in: expiresInSeconds || 3600, // Default 1 hour
  };
}
