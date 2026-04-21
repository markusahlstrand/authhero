import { Context } from "hono";
import {
  AuthorizationResponseType,
  KeysAdapter,
  TenantsDataAdapter,
} from "@authhero/adapter-interfaces";
import { TimeSpan } from "oslo";
import { createJWT } from "oslo/jwt";
import { Bindings, Variables } from "../types";
import { createAuthTokens } from "../authentication-flows/common";
import { pemToBuffer } from "../utils/crypto";

const AUTH_SERVICE_CLIENT_ID = "auth-service";
const DEFAULT_EXPIRES_IN_SECONDS = 3600;
const RESERVED_CLAIMS = ["sub", "iss", "aud", "exp", "nbf", "iat", "jti"];

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

  const { signingKeys } = await keys.list({ q: "type:jwt_signing" });
  const validKeys = signingKeys.filter(
    (key) => !key.revoked_at || new Date(key.revoked_at) > new Date(),
  );
  const signingKey = validKeys[validKeys.length - 1];
  if (!signingKey?.pkcs7) {
    throw new Error("No signing key available");
  }

  const keyBuffer = pemToBuffer(signingKey.pkcs7);
  const expiresInSeconds = params.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;

  const accessTokenPayload: Record<string, unknown> = {
    aud: audience,
    scope,
    sub: AUTH_SERVICE_CLIENT_ID,
    azp: AUTH_SERVICE_CLIENT_ID,
    iss: issuer,
    tenant_id: tenantId,
    ...params.customClaims,
  };

  const access_token = await createJWT("RS256", keyBuffer, accessTokenPayload, {
    includeIssuedTimestamp: true,
    expiresIn: new TimeSpan(expiresInSeconds, "s"),
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
}) {
  return async (tenantId: string, scope = "webhook"): Promise<string> => {
    const token = await createServiceTokenCore({
      tenants: deps.tenants,
      keys: deps.keys,
      tenantId,
      scope,
      issuer: deps.issuer,
    });
    return token.access_token;
  };
}

export { AUTH_SERVICE_CLIENT_ID };
