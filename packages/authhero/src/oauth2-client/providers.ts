/**
 * Provider-specific OAuth2 clients vendored from arctic@3.7.0 (MIT,
 * pilcrowonpaper). Endpoints and request shapes match arctic; see client.ts
 * for the deliberate differences.
 */
import { encodeBase64Url } from "@authhero/adapter-interfaces";
import {
  OAuth2Client,
  OAuth2FetchError,
  OAuth2Tokens,
  UnexpectedErrorResponseBodyError,
  UnexpectedResponseError,
  createOAuth2Request,
  createOAuth2RequestError,
  encodeBasicCredentials,
  sendTokenRequest,
} from "./client";

export class Google {
  private client: OAuth2Client;

  constructor(clientId: string, clientSecret: string, redirectURI: string) {
    this.client = new OAuth2Client(clientId, clientSecret, redirectURI);
  }

  async createAuthorizationURL(
    state: string,
    codeVerifier: string,
    scopes: string[],
  ): Promise<URL> {
    return this.client.createAuthorizationURLWithPKCE(
      "https://accounts.google.com/o/oauth2/v2/auth",
      state,
      "S256",
      codeVerifier,
      scopes,
    );
  }

  async validateAuthorizationCode(
    code: string,
    codeVerifier: string,
  ): Promise<OAuth2Tokens> {
    return this.client.validateAuthorizationCode(
      "https://oauth2.googleapis.com/token",
      code,
      codeVerifier,
    );
  }
}

export class Facebook {
  private clientId: string;
  private clientSecret: string;
  private redirectURI: string;

  constructor(clientId: string, clientSecret: string, redirectURI: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectURI = redirectURI;
  }

  createAuthorizationURL(state: string, scopes: string[]): URL {
    const url = new URL("https://www.facebook.com/v16.0/dialog/oauth");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("state", state);
    if (scopes.length > 0) {
      url.searchParams.set("scope", scopes.join(" "));
    }
    url.searchParams.set("redirect_uri", this.redirectURI);
    return url;
  }

  async validateAuthorizationCode(code: string): Promise<OAuth2Tokens> {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", this.redirectURI);
    body.set("client_id", this.clientId);
    body.set("client_secret", this.clientSecret);
    const request = createOAuth2Request(
      "https://graph.facebook.com/v16.0/oauth/access_token",
      body,
    );
    return sendTokenRequest(request);
  }
}

export class GitHub {
  private clientId: string;
  private clientSecret: string;
  private redirectURI: string | null;

  constructor(
    clientId: string,
    clientSecret: string,
    redirectURI: string | null,
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectURI = redirectURI;
  }

  createAuthorizationURL(state: string, scopes: string[]): URL {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("state", state);
    if (scopes.length > 0) {
      url.searchParams.set("scope", scopes.join(" "));
    }
    if (this.redirectURI !== null) {
      url.searchParams.set("redirect_uri", this.redirectURI);
    }
    return url;
  }

  async validateAuthorizationCode(code: string): Promise<OAuth2Tokens> {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    if (this.redirectURI !== null) {
      body.set("redirect_uri", this.redirectURI);
    }
    const request = createOAuth2Request(
      "https://github.com/login/oauth/access_token",
      body,
    );
    const encodedCredentials = encodeBasicCredentials(
      this.clientId,
      this.clientSecret,
    );
    request.headers.set("Authorization", `Basic ${encodedCredentials}`);
    return sendGitHubTokenRequest(request);
  }
}

/**
 * GitHub returns errors with a 200 status and an `error` field in the body,
 * so the generic status-based handling in `sendTokenRequest` can't be used.
 */
async function sendGitHubTokenRequest(request: Request): Promise<OAuth2Tokens> {
  let response: Response;
  try {
    response = await fetch(request);
  } catch (e) {
    throw new OAuth2FetchError(e);
  }
  if (response.status !== 200) {
    if (response.body !== null) {
      await response.body.cancel();
    }
    throw new UnexpectedResponseError(response.status);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new UnexpectedResponseError(response.status);
  }
  if (typeof data !== "object" || data === null) {
    throw new UnexpectedErrorResponseBodyError(response.status, data);
  }
  const record: Record<string, unknown> = { ...data };
  if (typeof record.error === "string") {
    let error: Error;
    try {
      error = createOAuth2RequestError(record);
    } catch {
      throw new UnexpectedErrorResponseBodyError(response.status, data);
    }
    throw error;
  }
  return new OAuth2Tokens(record);
}

export class MicrosoftEntraId {
  private authorizationEndpoint: string;
  private tokenEndpoint: string;
  private clientId: string;
  private clientSecret: string | null;
  private redirectURI: string;

  constructor(
    tenant: string,
    clientId: string,
    clientSecret: string | null,
    redirectURI: string,
  ) {
    const trimmedTenant = tenant.replace(/^\/+|\/+$/g, "");
    this.authorizationEndpoint = `https://login.microsoftonline.com/${trimmedTenant}/oauth2/v2.0/authorize`;
    this.tokenEndpoint = `https://login.microsoftonline.com/${trimmedTenant}/oauth2/v2.0/token`;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectURI = redirectURI;
  }

  async createAuthorizationURL(
    state: string,
    codeVerifier: string,
    scopes: string[],
  ): Promise<URL> {
    const client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectURI,
    );
    return client.createAuthorizationURLWithPKCE(
      this.authorizationEndpoint,
      state,
      "S256",
      codeVerifier,
      scopes,
    );
  }

  async validateAuthorizationCode(
    code: string,
    codeVerifier: string,
  ): Promise<OAuth2Tokens> {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", this.redirectURI);
    body.set("code_verifier", codeVerifier);
    if (this.clientSecret === null) {
      body.set("client_id", this.clientId);
    }
    const request = createOAuth2Request(this.tokenEndpoint, body);
    if (this.clientSecret !== null) {
      const encodedCredentials = encodeBasicCredentials(
        this.clientId,
        this.clientSecret,
      );
      request.headers.set("Authorization", `Basic ${encodedCredentials}`);
    } else {
      // Origin header required for public clients. Value can be anything.
      request.headers.set("Origin", "authhero");
    }
    return sendTokenRequest(request);
  }
}

export class Apple {
  private clientId: string;
  private teamId: string;
  private keyId: string;
  private pkcs8PrivateKey: Uint8Array<ArrayBuffer>;
  private redirectURI: string;

  constructor(
    clientId: string,
    teamId: string,
    keyId: string,
    pkcs8PrivateKey: Uint8Array<ArrayBuffer>,
    redirectURI: string,
  ) {
    this.clientId = clientId;
    this.teamId = teamId;
    this.keyId = keyId;
    this.pkcs8PrivateKey = pkcs8PrivateKey; // gitleaks:allow — parameter assignment, not a secret
    this.redirectURI = redirectURI;
  }

  createAuthorizationURL(state: string, scopes: string[]): URL {
    const url = new URL("https://appleid.apple.com/auth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("state", state);
    if (scopes.length > 0) {
      url.searchParams.set("scope", scopes.join(" "));
    }
    url.searchParams.set("redirect_uri", this.redirectURI);
    return url;
  }

  async validateAuthorizationCode(code: string): Promise<OAuth2Tokens> {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", this.redirectURI);
    body.set("client_id", this.clientId);
    body.set("client_secret", await this.createClientSecret());
    const request = createOAuth2Request(
      "https://appleid.apple.com/auth/token",
      body,
    );
    return sendTokenRequest(request);
  }

  /**
   * Apple's "client secret" is a short-lived ES256 JWT signed with the
   * developer's private key (Sign in with Apple docs, "Creating a client
   * secret").
   */
  private async createClientSecret(): Promise<string> {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      this.pkcs8PrivateKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const now = Math.floor(Date.now() / 1000);
    const encoder = new TextEncoder();
    const header = encodeBase64Url(
      encoder.encode(
        JSON.stringify({ typ: "JWT", alg: "ES256", kid: this.keyId }),
      ),
    );
    const payload = encodeBase64Url(
      encoder.encode(
        JSON.stringify({
          iss: this.teamId,
          exp: now + 5 * 60,
          aud: ["https://appleid.apple.com"],
          sub: this.clientId,
          iat: now,
        }),
      ),
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        encoder.encode(`${header}.${payload}`),
      ),
    );
    return `${header}.${payload}.${encodeBase64Url(signature)}`;
  }
}
