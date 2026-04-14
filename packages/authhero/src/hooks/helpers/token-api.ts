import { Context } from "hono";
import { Bindings, Variables } from "../../types";
import { createServiceToken } from "../../helpers/service-token";

/**
 * Build the `token` API surface that user-authored hook code receives. A thin
 * wrapper over `createServiceToken` that hides the underlying context so the
 * hook runtime cannot mint tokens for arbitrary tenants.
 */
export function createTokenAPI(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
) {
  return {
    createServiceToken: async (params: {
      scope: string;
      expiresInSeconds?: number;
      customClaims?: Record<string, unknown>;
    }) => {
      const tokenResponse = await createServiceToken(
        ctx,
        tenant_id,
        params.scope,
        params.expiresInSeconds,
        params.customClaims,
      );
      return tokenResponse.access_token;
    },
  };
}
