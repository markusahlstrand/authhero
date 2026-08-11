/**
 * Minimal OAuth2 client vendored from arctic@3.7.0 (MIT, pilcrowonpaper),
 * which was deprecated upstream in July 2026 with no further security fixes.
 * The wire behavior is kept byte-compatible with arctic; the only deliberate
 * differences are WebCrypto instead of @oslojs/crypto (which makes the PKCE
 * URL builder async) and an `authhero` User-Agent on token requests.
 */
import { encodeBase64Url } from "@authhero/adapter-interfaces";
import { computeCodeChallenge, generateCodeVerifier } from "../utils/crypto";

export { generateCodeVerifier };

export type CodeChallengeMethod = "S256" | "plain";

/** A high-entropy CSRF state value: 32 random bytes, base64url-encoded. */
export function generateState(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export class OAuth2Tokens {
  public data: Record<string, unknown>;

  constructor(data: Record<string, unknown>) {
    this.data = data;
  }

  tokenType(): string {
    if (typeof this.data.token_type === "string") {
      return this.data.token_type;
    }
    throw new Error("Missing or invalid 'token_type' field");
  }

  accessToken(): string {
    if (typeof this.data.access_token === "string") {
      return this.data.access_token;
    }
    throw new Error("Missing or invalid 'access_token' field");
  }

  accessTokenExpiresInSeconds(): number {
    if (typeof this.data.expires_in === "number") {
      return this.data.expires_in;
    }
    throw new Error("Missing or invalid 'expires_in' field");
  }

  accessTokenExpiresAt(): Date {
    return new Date(Date.now() + this.accessTokenExpiresInSeconds() * 1000);
  }

  hasRefreshToken(): boolean {
    return typeof this.data.refresh_token === "string";
  }

  refreshToken(): string {
    if (typeof this.data.refresh_token === "string") {
      return this.data.refresh_token;
    }
    throw new Error("Missing or invalid 'refresh_token' field");
  }

  hasScopes(): boolean {
    return typeof this.data.scope === "string";
  }

  scopes(): string[] {
    if (typeof this.data.scope === "string") {
      return this.data.scope.split(" ");
    }
    throw new Error("Missing or invalid 'scope' field");
  }

  idToken(): string {
    if (typeof this.data.id_token === "string") {
      return this.data.id_token;
    }
    throw new Error("Missing or invalid field 'id_token'");
  }
}

export class OAuth2RequestError extends Error {
  public code: string;
  public description: string | null;
  public uri: string | null;
  public state: string | null;

  constructor(
    code: string,
    description: string | null,
    uri: string | null,
    state: string | null,
  ) {
    super(`OAuth request error: ${code}`);
    this.code = code;
    this.description = description;
    this.uri = uri;
    this.state = state;
  }
}

export class OAuth2FetchError extends Error {
  constructor(cause: unknown) {
    super("Failed to send request", { cause });
  }
}

export class UnexpectedResponseError extends Error {
  public status: number;

  constructor(responseStatus: number) {
    super("Unexpected error response");
    this.status = responseStatus;
  }
}

export class UnexpectedErrorResponseBodyError extends Error {
  public status: number;
  public data: unknown;

  constructor(status: number, data: unknown) {
    super("Unexpected error response body");
    this.status = status;
    this.data = data;
  }
}

export function createOAuth2Request(
  endpoint: string,
  body: URLSearchParams,
): Request {
  const bodyBytes = new TextEncoder().encode(body.toString());
  const request = new Request(endpoint, {
    method: "POST",
    body: bodyBytes,
  });
  request.headers.set("Content-Type", "application/x-www-form-urlencoded");
  request.headers.set("Accept", "application/json");
  // Required by GitHub, and probably by others as well
  request.headers.set("User-Agent", "authhero");
  request.headers.set("Content-Length", bodyBytes.byteLength.toString());
  return request;
}

export function encodeBasicCredentials(
  username: string,
  password: string,
): string {
  return btoa(`${username}:${password}`);
}

export function createOAuth2RequestError(
  result: Record<string, unknown>,
): OAuth2RequestError {
  if (typeof result.error !== "string") {
    throw new Error("Invalid error response");
  }
  const code = result.error;
  let description: string | null = null;
  let uri: string | null = null;
  let state: string | null = null;
  if ("error_description" in result) {
    if (typeof result.error_description !== "string") {
      throw new Error("Invalid data");
    }
    description = result.error_description;
  }
  if ("error_uri" in result) {
    if (typeof result.error_uri !== "string") {
      throw new Error("Invalid data");
    }
    uri = result.error_uri;
  }
  if ("state" in result) {
    if (typeof result.state !== "string") {
      throw new Error("Invalid data");
    }
    state = result.state;
  }
  return new OAuth2RequestError(code, description, uri, state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function sendTokenRequest(
  request: Request,
): Promise<OAuth2Tokens> {
  let response: Response;
  try {
    response = await fetch(request);
  } catch (e) {
    throw new OAuth2FetchError(e);
  }
  if (response.status === 400 || response.status === 401) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new UnexpectedResponseError(response.status);
    }
    if (!isRecord(data)) {
      throw new UnexpectedErrorResponseBodyError(response.status, data);
    }
    let error: OAuth2RequestError;
    try {
      error = createOAuth2RequestError(data);
    } catch {
      throw new UnexpectedErrorResponseBodyError(response.status, data);
    }
    throw error;
  }
  if (response.status === 200) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new UnexpectedResponseError(response.status);
    }
    if (!isRecord(data)) {
      throw new UnexpectedErrorResponseBodyError(response.status, data);
    }
    return new OAuth2Tokens(data);
  }
  if (response.body !== null) {
    await response.body.cancel();
  }
  throw new UnexpectedResponseError(response.status);
}

export class OAuth2Client {
  public clientId: string;
  public clientPassword: string | null;
  public redirectURI: string | null;

  constructor(
    clientId: string,
    clientPassword: string | null,
    redirectURI: string | null,
  ) {
    this.clientId = clientId;
    this.clientPassword = clientPassword;
    this.redirectURI = redirectURI;
  }

  createAuthorizationURL(
    authorizationEndpoint: string,
    state: string,
    scopes: string[],
  ): URL {
    const url = new URL(authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    if (this.redirectURI !== null) {
      url.searchParams.set("redirect_uri", this.redirectURI);
    }
    url.searchParams.set("state", state);
    if (scopes.length > 0) {
      url.searchParams.set("scope", scopes.join(" "));
    }
    return url;
  }

  async createAuthorizationURLWithPKCE(
    authorizationEndpoint: string,
    state: string,
    codeChallengeMethod: CodeChallengeMethod,
    codeVerifier: string,
    scopes: string[],
  ): Promise<URL> {
    const url = new URL(authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    if (this.redirectURI !== null) {
      url.searchParams.set("redirect_uri", this.redirectURI);
    }
    url.searchParams.set("state", state);
    const codeChallenge = await computeCodeChallenge(
      codeVerifier,
      codeChallengeMethod,
    );
    url.searchParams.set("code_challenge_method", codeChallengeMethod);
    url.searchParams.set("code_challenge", codeChallenge);
    if (scopes.length > 0) {
      url.searchParams.set("scope", scopes.join(" "));
    }
    return url;
  }

  async validateAuthorizationCode(
    tokenEndpoint: string,
    code: string,
    codeVerifier: string | null,
  ): Promise<OAuth2Tokens> {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    if (this.redirectURI !== null) {
      body.set("redirect_uri", this.redirectURI);
    }
    if (codeVerifier !== null) {
      body.set("code_verifier", codeVerifier);
    }
    if (this.clientPassword === null) {
      body.set("client_id", this.clientId);
    }
    const request = createOAuth2Request(tokenEndpoint, body);
    if (this.clientPassword !== null) {
      const encodedCredentials = encodeBasicCredentials(
        this.clientId,
        this.clientPassword,
      );
      request.headers.set("Authorization", `Basic ${encodedCredentials}`);
    }
    return sendTokenRequest(request);
  }
}
