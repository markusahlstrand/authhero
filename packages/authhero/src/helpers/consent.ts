import { Context } from "hono";
import { Bindings, Variables } from "../types";

/**
 * OIDC basic scopes — these are exempt from the third-party consent gate
 * because they only authorize the standard ID-token / userinfo claims that
 * are implicit in any OIDC sign-in.
 */
export const BASIC_OIDC_SCOPES = new Set<string>([
  "openid",
  "profile",
  "email",
]);

/**
 * Return the scopes in `requested` that are not in `consented` and are not
 * basic OIDC scopes. An empty result means the existing consent record (if
 * any) covers everything the client asked for.
 */
export function computeMissingConsentScopes(
  requested: string[],
  consented: string[],
): string[] {
  const consentedSet = new Set(consented);
  const missing: string[] = [];
  for (const scope of requested) {
    if (!scope) continue;
    if (BASIC_OIDC_SCOPES.has(scope)) continue;
    if (consentedSet.has(scope)) continue;
    missing.push(scope);
  }
  return Array.from(new Set(missing));
}

/**
 * Load the user's stored consent for (tenant, user, client) and compute the
 * scopes that still need explicit consent. Returns an empty array if the
 * consent gate should pass.
 *
 * Fail-closed when the adapter isn't configured: the function treats every
 * non-basic requested scope as missing so the caller blocks the auth flow.
 */
export async function getMissingConsentScopes(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: {
    tenantId: string;
    userId: string;
    clientId: string;
    requestedScopes: string[];
  },
): Promise<string[]> {
  if (!ctx.env.data.userConsents) {
    return computeMissingConsentScopes(params.requestedScopes, []);
  }
  const record = await ctx.env.data.userConsents.get(
    params.tenantId,
    params.userId,
    params.clientId,
  );
  return computeMissingConsentScopes(
    params.requestedScopes,
    record?.scopes ?? [],
  );
}
