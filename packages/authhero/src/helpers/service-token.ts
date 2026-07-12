import { Context } from "hono";
import {
  AuthorizationResponseType,
  KeysAdapter,
  TenantsDataAdapter,
} from "@authhero/adapter-interfaces";
import { signJWT } from "../utils/jwt";
import { Bindings, Variables } from "../types";
import { SigningKeyModeOption } from "../types/AuthHeroConfig";
import { createAuthTokens } from "../authentication-flows/common";
import { pemToBuffer } from "../utils/crypto";
import { algForCert } from "../utils/jwk-alg";
import { getIssuer } from "../variables";
import { resolveSigningKeys } from "./signing-keys";

const AUTH_SERVICE_CLIENT_ID = "auth-service";
const DEFAULT_EXPIRES_IN_SECONDS = 3600;
const RESERVED_CLAIMS = [
  "sub",
  "iss",
  "aud",
  "exp",
  "nbf",
  "iat",
  "jti",
  "scope",
  "azp",
  "tenant_id",
];

export interface ServiceTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface CreateServiceTokenCoreParams {
  tenants: TenantsDataAdapter;
  keys: KeysAdapter;
  tenantId: string;
  scope: string;
  issuer: string;
  expiresInSeconds?: number;
  customClaims?: Record<string, unknown>;
  /**
   * Optional per-tenant signing-key bucket selector. When unset the
   * tenant uses the shared control-plane keys (legacy behavior) which
   * keeps existing outbox/cron callers working without any change.
   */
  signingKeyMode?: SigningKeyModeOption;
}

/**
 * Ctx-free service token minter. Produces a signed JWT for the `auth-service`
 * client using the tenant's current JWT signing key. Intended to be shared
 * between the request-time outbox dispatcher and the cron `runOutboxRelay`
 * helper so both paths emit tokens with identical issuer, subject, tenant
 * binding, and signing key.
 */
export async function createServiceTokenCore(
  params: CreateServiceTokenCoreParams,
): Promise<ServiceTokenResponse> {
  const { tenants, keys, tenantId, scope, issuer } = params;

  const tenant = await tenants.get(tenantId);
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const audience = tenant.audience;
  if (!audience) {
    throw new Error(
      `Cannot mint service token: tenant "${tenantId}" has no default audience`,
    );
  }

  if (params.customClaims) {
    for (const claim of RESERVED_CLAIMS) {
      if (claim in params.customClaims) {
        throw new Error(`Cannot overwrite reserved claim '${claim}'`);
      }
    }
  }

  const resolvedKeys = await resolveSigningKeys(
    keys,
    tenantId,
    params.signingKeyMode,
    { purpose: "sign" },
  );
  const signingKey = resolvedKeys[0];
  if (!signingKey?.pkcs7 || !signingKey.cert) {
    throw new Error("No signing key available");
  }

  const keyBuffer = pemToBuffer(signingKey.pkcs7);
  const alg = await algForCert(signingKey.cert);
  const expiresInSeconds =
    params.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;

  const accessTokenPayload: Record<string, unknown> = {
    aud: audience,
    scope,
    sub: AUTH_SERVICE_CLIENT_ID,
    azp: AUTH_SERVICE_CLIENT_ID,
    iss: issuer,
    tenant_id: tenantId,
    ...params.customClaims,
  };

  const access_token = await signJWT(alg, keyBuffer, accessTokenPayload, {
    includeIssuedTimestamp: true,
    expiresInSeconds,
    headers: { kid: signingKey.kid },
  });

  return {
    access_token,
    token_type: "Bearer",
    expires_in: expiresInSeconds,
  };
}

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
      audience: tenant.audience,
    },
    customClaims,
  });

  return {
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type,
    expires_in: expiresInSeconds || DEFAULT_EXPIRES_IN_SECONDS,
  };
}

/**
 * Bound ctx-free token factory for outbox destinations. Mirrors the shape
 * expected by `WebhookDestination` and `createDefaultDestinations` but uses
 * `createServiceTokenCore` under the hood so the inline per-request outbox
 * dispatcher and the cron `runOutboxRelay` emit identical tokens.
 */
export function makeOutboxServiceTokenFactory(deps: {
  tenants: TenantsDataAdapter;
  keys: KeysAdapter;
  issuer: string;
  signingKeyMode?: SigningKeyModeOption;
}) {
  return async (tenantId: string, scope = "webhook"): Promise<string> => {
    const token = await createServiceTokenCore({
      tenants: deps.tenants,
      keys: deps.keys,
      tenantId,
      scope,
      issuer: deps.issuer,
      signingKeyMode: deps.signingKeyMode,
    });
    return token.access_token;
  };
}

export interface CreateClientServiceTokenParams {
  clientId: string;
  scope: string;
  audience?: string;
  expiresInSeconds?: number;
  customClaims?: Record<string, unknown>;
}

/**
 * Resolve the control-plane tenant for a given request tenant, honoring a
 * per-tenant `resolveControlPlane` resolver when configured and falling back to
 * the static `controlPlaneTenantId`. Returns `undefined` when the tenant opts
 * out of control-plane inheritance or no control plane is configured.
 */
async function resolveControlPlaneTenantId(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
): Promise<string | undefined> {
  const config = ctx.env.data.multiTenancyConfig;
  if (config?.resolveControlPlane) {
    const resolved = await config.resolveControlPlane({ tenant_id: tenantId });
    return resolved?.tenantId;
  }
  return config?.controlPlaneTenantId;
}

export interface CreateClientServiceTokenOptions {
  /**
   * When the client isn't found in the request tenant, resolve it against the
   * configured control-plane tenant and mint there instead. Off by default so
   * that the hook-facing token API (`createTokenAPI`) cannot reach across the
   * tenant boundary into control-plane clients — only trusted internal callers
   * (e.g. the auth service's own email/SMS senders) opt in.
   */
  allowControlPlaneFallback?: boolean;
}

/**
 * In-process mint of a grant-bounded access token for a DB-registered M2M
 * client. The caller is trusted (running inside the Worker) so no client
 * secret is required — authorization is governed by the client's
 * `client_grant` records. Mirrors what the token endpoint would return for a
 * `client_credentials` grant.
 *
 * Fails closed: rejects if the client has no grant for the (audience), or if
 * any requested scope is not in `grant.scope`.
 */
export async function createClientServiceToken(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: CreateClientServiceTokenParams,
  options?: CreateClientServiceTokenOptions,
): Promise<ServiceTokenResponse> {
  const { clientId, scope } = params;

  const tenant = await ctx.env.data.tenants.get(tenantId);
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  // M2M service clients (e.g. the auth service's own email sender) are
  // registered once in the control-plane tenant, not per request-tenant. The
  // multi-tenancy adapter deliberately does not control-plane-wrap `clients.get`
  // for storage reads, so when the client isn't found in the request tenant we
  // resolve it against the control plane and mint there: grants, signing key,
  // and the `tenant_id` claim all follow the tenant where the client lives.
  // Gated behind `allowControlPlaneFallback` so only trusted internal callers
  // can cross the tenant boundary; hook-originated calls never reach it.
  let effectiveTenantId = tenantId;
  let client = await ctx.env.data.clients.get(tenantId, clientId);
  if (!client && options?.allowControlPlaneFallback) {
    const controlPlaneTenantId = await resolveControlPlaneTenantId(
      ctx,
      tenantId,
    );
    if (controlPlaneTenantId && controlPlaneTenantId !== tenantId) {
      const controlPlaneClient = await ctx.env.data.clients.get(
        controlPlaneTenantId,
        clientId,
      );
      if (controlPlaneClient) {
        client = controlPlaneClient;
        effectiveTenantId = controlPlaneTenantId;
      }
    }
  }
  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  const clientGrantsResponse = await ctx.env.data.clientGrants.list(
    effectiveTenantId,
    {
      q: `client_id:"${clientId}"`,
    },
  );
  const grants = clientGrantsResponse.client_grants;
  if (grants.length === 0) {
    throw new Error(`Client has no client_grant: ${clientId}`);
  }

  let resolvedAudience: string;
  let grant: (typeof grants)[number] | undefined;
  if (params.audience) {
    grant = grants.find((g) => g.audience === params.audience);
    if (!grant) {
      throw new Error(
        `Client ${clientId} has no client_grant for audience: ${params.audience}`,
      );
    }
    resolvedAudience = params.audience;
  } else if (grants.length === 1) {
    grant = grants[0]!;
    resolvedAudience = grant.audience;
  } else {
    throw new Error(
      `audience is required: client ${clientId} has multiple client_grants`,
    );
  }

  const grantedScopes = grant.scope || [];
  const requestedScopes = scope.split(/\s+/).filter(Boolean);
  const unauthorizedScopes = requestedScopes.filter(
    (s) => !grantedScopes.includes(s),
  );
  if (unauthorizedScopes.length > 0) {
    throw new Error(
      `access_denied: Client is not authorized for scope(s): ${unauthorizedScopes.join(", ")}`,
    );
  }

  if (params.customClaims) {
    for (const claim of RESERVED_CLAIMS) {
      if (claim in params.customClaims) {
        throw new Error(`Cannot overwrite reserved claim '${claim}'`);
      }
    }
  }

  const resolvedKeys = await resolveSigningKeys(
    ctx.env.data.keys,
    effectiveTenantId,
    ctx.env.signingKeyMode,
    { purpose: "sign" },
  );
  const signingKey = resolvedKeys[0];
  if (!signingKey?.pkcs7 || !signingKey.cert) {
    throw new Error("No signing key available");
  }

  const keyBuffer = pemToBuffer(signingKey.pkcs7);
  const alg = await algForCert(signingKey.cert);
  const expiresInSeconds =
    params.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;

  const accessTokenPayload: Record<string, unknown> = {
    ...params.customClaims,
    aud: resolvedAudience,
    scope: requestedScopes.join(" "),
    sub: clientId,
    azp: clientId,
    iss: getIssuer(ctx.env),
    tenant_id: effectiveTenantId,
    gty: "client_credentials",
  };

  const access_token = await signJWT(alg, keyBuffer, accessTokenPayload, {
    includeIssuedTimestamp: true,
    expiresInSeconds,
    headers: { kid: signingKey.kid },
  });

  return {
    access_token,
    token_type: "Bearer",
    expires_in: expiresInSeconds,
  };
}

export { AUTH_SERVICE_CLIENT_ID };
