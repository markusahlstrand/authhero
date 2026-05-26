import { Context } from "hono";
import { Bindings, Variables } from "../../types";
import {
  createClientServiceToken,
  createServiceToken,
} from "../../helpers/service-token";

/**
 * Build the `token` API surface that user-authored hook code receives. A thin
 * wrapper over `createServiceToken` that hides the underlying context so the
 * hook runtime cannot mint tokens for arbitrary tenants.
 *
 * When `clientId` is provided, the token is grant-bounded to that DB-registered
 * M2M client (the requested `scope`/`audience` must be authorized by an
 * existing `client_grant`). Without `clientId`, falls back to the legacy
 * `auth-service` token bound to the tenant's default audience.
 */
export function createTokenAPI(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
) {
  return {
    createServiceToken: async (params: {
      scope: string;
      clientId?: string;
      audience?: string;
      expiresInSeconds?: number;
      customClaims?: Record<string, unknown>;
    }) => {
      if (params.clientId) {
        const tokenResponse = await createClientServiceToken(ctx, tenant_id, {
          clientId: params.clientId,
          scope: params.scope,
          audience: params.audience,
          expiresInSeconds: params.expiresInSeconds,
          customClaims: params.customClaims,
        });
        return tokenResponse.access_token;
      }
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
