/**
 * Helpers that call an upstream Auth0 tenant during lazy migration.
 *
 * Used by:
 * - password.ts: ROPG (password-realm grant) on missed local password lookup,
 *   followed by /userinfo to read the profile.
 * - refresh-token.ts: forward `grant_type=refresh_token` for tokens that don't
 *   match any local row.
 *
 * No M2M token is required: ROPG uses the configured client_id/client_secret,
 * and /userinfo is called with the access_token returned by ROPG.
 */

const PASSWORD_REALM_GRANT = "http://auth0.com/oauth/grant-type/password-realm";
const DEFAULT_SCOPE = "openid profile email";
const UPSTREAM_REFRESH_TIMEOUT_MS = 10_000;

export type Auth0UpstreamErrorCode =
  | "invalid_grant"
  | "invalid_request"
  | "unauthorized_client"
  | "mfa_required"
  | "access_denied"
  | "network_error"
  | "malformed_response"
  | string;

export class Auth0UpstreamError extends Error {
  readonly status: number;
  readonly code: Auth0UpstreamErrorCode;
  readonly description?: string;

  constructor(
    status: number,
    code: Auth0UpstreamErrorCode,
    description?: string,
  ) {
    super(description ?? code);
    this.name = "Auth0UpstreamError";
    this.status = status;
    this.code = code;
    this.description = description;
  }
}

export interface Auth0TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface Auth0UserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  picture?: string;
  locale?: string;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Auth0UpstreamError(
      response.status,
      "malformed_response",
      "Upstream returned non-JSON body",
    );
  }
}

function readTokenResponse(payload: unknown): Auth0TokenResponse {
  if (!isRecord(payload)) {
    throw new Auth0UpstreamError(
      502,
      "malformed_response",
      "Upstream token response was not an object",
    );
  }
  const access_token = asString(payload.access_token);
  if (!access_token) {
    throw new Auth0UpstreamError(
      502,
      "malformed_response",
      "Upstream token response missing access_token",
    );
  }
  return {
    access_token,
    id_token: asString(payload.id_token),
    refresh_token: asString(payload.refresh_token),
    expires_in:
      typeof payload.expires_in === "number" ? payload.expires_in : undefined,
    token_type: asString(payload.token_type),
    scope: asString(payload.scope),
  };
}

function readUpstreamError(
  status: number,
  payload: unknown,
): Auth0UpstreamError {
  const code = isRecord(payload) ? asString(payload.error) : undefined;
  const description = isRecord(payload)
    ? asString(payload.error_description)
    : undefined;
  return new Auth0UpstreamError(
    status,
    code ?? "invalid_grant",
    description ?? `Upstream returned HTTP ${status}`,
  );
}

export interface PasswordRealmGrantParams {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  realm: string;
  username: string;
  password: string;
  audience?: string;
  scope?: string;
}

export async function passwordRealmGrant(
  params: PasswordRealmGrantParams,
): Promise<Auth0TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", PASSWORD_REALM_GRANT);
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("realm", params.realm);
  body.set("username", params.username);
  body.set("password", params.password);
  body.set("scope", params.scope ?? DEFAULT_SCOPE);
  if (params.audience) {
    body.set("audience", params.audience);
  }

  let response: Response;
  try {
    response = await fetch(params.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    throw new Auth0UpstreamError(0, "network_error", message);
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    throw readUpstreamError(response.status, payload);
  }

  return readTokenResponse(payload);
}

export interface UpstreamRefreshTokenGrantParams {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  audience?: string;
  scope?: string;
}

export async function upstreamRefreshTokenGrant(
  params: UpstreamRefreshTokenGrantParams,
): Promise<Auth0TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("refresh_token", params.refreshToken);
  if (params.scope) {
    body.set("scope", params.scope);
  }
  if (params.audience) {
    body.set("audience", params.audience);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    UPSTREAM_REFRESH_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await fetch(params.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Auth0UpstreamError(0, "network_error", "request_timed_out");
    }
    const message = err instanceof Error ? err.message : "fetch failed";
    throw new Auth0UpstreamError(0, "network_error", message);
  } finally {
    clearTimeout(timer);
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    throw readUpstreamError(response.status, payload);
  }

  return readTokenResponse(payload);
}

export async function fetchUserInfo(
  userinfoEndpoint: string,
  accessToken: string,
): Promise<Auth0UserInfo> {
  let response: Response;
  try {
    response = await fetch(userinfoEndpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    throw new Auth0UpstreamError(0, "network_error", message);
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    throw readUpstreamError(response.status, payload);
  }

  if (!isRecord(payload)) {
    throw new Auth0UpstreamError(
      502,
      "malformed_response",
      "Upstream userinfo response was not an object",
    );
  }
  const sub = asString(payload.sub);
  if (!sub) {
    throw new Auth0UpstreamError(
      502,
      "malformed_response",
      "Upstream userinfo response missing sub",
    );
  }

  return { ...payload, sub };
}
