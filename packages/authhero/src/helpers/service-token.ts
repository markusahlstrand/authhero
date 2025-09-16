import { Context } from "hono";
import {
  AuthorizationResponseType,
  LegacyClient,
} from "@authhero/adapter-interfaces";
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

  // Create a mock LegacyClient for service tokens
  const mockClient: LegacyClient = {
    client_id: ctx.env.ISSUER,
    tenant,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: ctx.env.ISSUER,
    global: false,
    is_first_party: false,
    oidc_conformant: false,
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
  } as LegacyClient;

  return createAuthTokens(ctx, {
    client: mockClient,
    authParams: {
      client_id: ctx.env.ISSUER,
      response_type: AuthorizationResponseType.TOKEN,
      scope,
    },
  });
}
