import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { GrantType, TokenResponse } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { GrantFlowResult } from "../types/GrantFlowResult";
import { JSONHTTPException } from "../errors/json-http-exception";
import { calculateScopesAndPermissions } from "../helpers/scopes-permissions";
import { createAuthTokens } from "./common";

/**
 * Turn a resolved grant into wire tokens: narrow the requested scopes to what
 * the user/client is actually granted for the audience, pick the token
 * lifetime from the resource server, then mint the tokens.
 *
 * Shared by the /oauth/token endpoint and the server-side code exchange on the
 * /u2/info test page so both mint identical tokens for the same grant.
 */
export async function issueTokensForGrant(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  grantResult: GrantFlowResult,
  grantType: GrantType,
): Promise<TokenResponse> {
  // Calculate scopes and permissions before creating tokens
  // This will throw a 403 error if user is not a member of the required organization
  let calculatedPermissions: string[] = [];
  let tokenLifetime: number | undefined;

  if (grantResult.authParams.audience) {
    try {
      let scopesAndPermissions;

      if (grantType === GrantType.ClientCredential) {
        scopesAndPermissions = await calculateScopesAndPermissions(ctx, {
          grantType: GrantType.ClientCredential,
          tenantId: grantResult.client.tenant.id,
          clientId: grantResult.client.client_id,
          audience: grantResult.authParams.audience,
          requestedScopes: grantResult.authParams.scope?.split(" ") || [],
          organizationId: grantResult.organization?.id,
        });
      } else {
        // For user-based grants, userId is required
        if (!grantResult.user?.user_id) {
          throw new JSONHTTPException(400, {
            error: "invalid_request",
            error_description: "User ID is required for user-based grants",
          });
        }

        scopesAndPermissions = await calculateScopesAndPermissions(ctx, {
          grantType,
          tenantId: grantResult.client.tenant.id,
          userId: grantResult.user.user_id,
          clientId: grantResult.client.client_id,
          audience: grantResult.authParams.audience,
          requestedScopes: grantResult.authParams.scope?.split(" ") || [],
          organizationId: grantResult.organization?.id,
        });
      }

      // Update the authParams with calculated scopes and store permissions
      grantResult.authParams.scope = scopesAndPermissions.scopes.join(" ");
      calculatedPermissions = scopesAndPermissions.permissions;

      // Use token_lifetime_for_web for SPA clients, token_lifetime for all others
      tokenLifetime =
        grantResult.client.app_type === "spa"
          ? (scopesAndPermissions.token_lifetime_for_web ??
            scopesAndPermissions.token_lifetime)
          : scopesAndPermissions.token_lifetime;
    } catch (error) {
      // Re-throw HTTPExceptions (like 403 for organization membership)
      if (error instanceof HTTPException) {
        throw error;
      }
      // For other errors, log and continue with original scopes
      console.error("Error calculating scopes and permissions:", error);
    }
  }

  return createAuthTokens(ctx, {
    ...grantResult,
    grantType,
    permissions:
      calculatedPermissions.length > 0 ? calculatedPermissions : undefined,
    token_lifetime: tokenLifetime,
  });
}
