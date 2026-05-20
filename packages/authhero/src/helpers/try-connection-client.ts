import { Bindings } from "../types";
import { getTryConnectionClientId } from "../constants";
import { getIssuer } from "../variables";

export function getTryConnectionResultPath(): string {
  return "u2/try-connection-result";
}

// The result page is served by the /u2 routes mounted at the issuer root —
// NOT under /u/. Build the URL directly from the issuer to match.
export function getTryConnectionResultUrl(
  env: Bindings,
  customDomain?: string,
): string {
  return `${getIssuer(env, customDomain)}${getTryConnectionResultPath()}`;
}

/**
 * Idempotently ensure the per-tenant "Try Connection" client exists.
 *
 * The client has no explicit connection enablement — `getEnrichedClient`'s
 * fallback then exposes every tenant connection on it, so the same client
 * can drive a test for any connection without re-provisioning.
 *
 * Its only registered callback is the universal-login result page; the
 * /authorize handler additionally allows the issuer + universal-login
 * wildcards which already cover that URL.
 */
export async function ensureTryConnectionClient(
  env: Bindings,
  tenantId: string,
): Promise<string> {
  const clientId = getTryConnectionClientId(tenantId);
  const existing = await env.data.clients.get(tenantId, clientId);
  if (existing) {
    return clientId;
  }

  const resultUrl = getTryConnectionResultUrl(env);
  await env.data.clients.create(tenantId, {
    client_id: clientId,
    name: "AuthHero Try Connection",
    callbacks: [resultUrl],
    allowed_logout_urls: [],
    web_origins: [],
    connections: [],
    client_metadata: {
      system_purpose: "try_connection",
    },
  });
  return clientId;
}
