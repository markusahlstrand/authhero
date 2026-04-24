import { Context } from "hono";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../../../types";
import { JSONHTTPException } from "../../../errors/json-http-exception";
import { getAuthUrl } from "../../../variables";
import { verifyRegistrationToken } from "../../../helpers/dcr/verify-token";
import { hashRegistrationToken } from "../../../helpers/dcr/mint-token";
import { extractBearerToken } from "../../../utils/auth-header";
import type {
  Client,
  ClientRegistrationToken,
  Tenant,
} from "@authhero/adapter-interfaces";

export type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

export function registrationClientUri(ctx: Ctx, client_id: string): string {
  return `${getAuthUrl(ctx.env, ctx.var.custom_domain)}oidc/register/${client_id}`;
}

export async function loadTenantOrFail(ctx: Ctx): Promise<Tenant> {
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new JSONHTTPException(404, {
      error: "invalid_request",
      error_description: "Tenant not found",
    });
  }
  return tenant;
}

export function assertDcrEnabled(tenant: Tenant) {
  if (!tenant.flags?.enable_dynamic_client_registration) {
    throw new JSONHTTPException(404, {
      error: "invalid_request",
      error_description: "Dynamic Client Registration is not enabled",
    });
  }
}

/**
 * Authenticate a POST /oidc/register request. Returns the IAT record if
 * bearer auth was used and validated; returns `undefined` for valid open
 * DCR. Throws 401 if IAT is required/invalid.
 */
export async function authenticateRegistrationRequest(
  ctx: Ctx,
  tenant: Tenant,
): Promise<ClientRegistrationToken | undefined> {
  const authHeader = ctx.req.header("authorization");
  const bearer = extractBearerToken(authHeader);

  if (bearer) {
    const result = await verifyRegistrationToken(
      ctx.env.data.clientRegistrationTokens,
      ctx.var.tenant_id,
      bearer,
      "iat",
    );
    if (!result.ok || !result.token) {
      throw new JSONHTTPException(401, {
        error: "invalid_token",
        error_description: `Initial access token ${result.failure ?? "invalid"}`,
      });
    }
    return result.token;
  }

  if (tenant.flags?.dcr_require_initial_access_token !== false) {
    // Default is require-IAT unless explicitly opted out.
    throw new JSONHTTPException(401, {
      error: "invalid_token",
      error_description: "Initial access token required",
    });
  }

  return undefined;
}

/**
 * Authenticate a RFC 7592 management request. Returns the RAT record
 * bound to the URL client_id. Throws 401 on failure.
 */
export async function authenticateManagementRequest(
  ctx: Ctx,
  client_id: string,
): Promise<ClientRegistrationToken> {
  const bearer = extractBearerToken(ctx.req.header("authorization"));
  if (!bearer) {
    throw new JSONHTTPException(401, {
      error: "invalid_token",
      error_description: "Registration access token required",
    });
  }

  const result = await verifyRegistrationToken(
    ctx.env.data.clientRegistrationTokens,
    ctx.var.tenant_id,
    bearer,
    "rat",
  );
  if (!result.ok || !result.token) {
    throw new JSONHTTPException(401, {
      error: "invalid_token",
      error_description: `Registration access token ${result.failure ?? "invalid"}`,
    });
  }

  if (result.token.client_id !== client_id) {
    throw new JSONHTTPException(401, {
      error: "invalid_token",
      error_description: "Registration access token is not bound to this client",
    });
  }

  return result.token;
}

export function isClientSoftDeleted(client: Client): boolean {
  return client.client_metadata?.status === "deleted";
}

export function generateClientId(): string {
  return nanoid(24);
}

export function generateClientSecret(): string {
  return nanoid(43);
}

export async function hashToken(token: string): Promise<string> {
  return hashRegistrationToken(token);
}
