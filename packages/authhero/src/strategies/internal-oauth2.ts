import {
  OAuth2Client,
  OAuth2Tokens,
  OAuth2RequestError,
} from "../oauth2-client";

/**
 * Extends `OAuth2Client` so we own the token-endpoint exchange. We support
 * both `client_secret_basic` (HTTP Basic) and `client_secret_post`
 * (credentials in form body), and always surface the upstream response body in
 * thrown errors — the base client discards it, which makes diagnosing
 * `invalid_client` from providers like JumpCloud nearly impossible.
 */
export type TokenEndpointAuthMethod =
  | "client_secret_basic"
  | "client_secret_post";

export class ExtendedOAuth2Client extends OAuth2Client {
  private readonly _clientId: string;
  private readonly _clientPassword: string | null;
  private readonly _redirectURI: string | null;
  private readonly tokenEndpointAuthMethod: TokenEndpointAuthMethod;

  constructor(
    clientId: string,
    clientPassword: string | null,
    redirectURI: string | null,
    tokenEndpointAuthMethod: TokenEndpointAuthMethod = "client_secret_basic",
  ) {
    super(clientId, clientPassword, redirectURI);
    this._clientId = clientId;
    this._clientPassword = clientPassword;
    this._redirectURI = redirectURI;
    this.tokenEndpointAuthMethod = tokenEndpointAuthMethod;
  }

  async validateAuthorizationCode(
    tokenEndpoint: string,
    code: string,
    codeVerifier: string | null,
  ): Promise<OAuth2Tokens> {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    if (this._redirectURI !== null) {
      body.set("redirect_uri", this._redirectURI);
    }
    if (codeVerifier !== null) {
      body.set("code_verifier", codeVerifier);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };

    if (
      this._clientPassword !== null &&
      this.tokenEndpointAuthMethod === "client_secret_post"
    ) {
      body.set("client_id", this._clientId);
      body.set("client_secret", this._clientPassword);
    } else if (this._clientPassword !== null) {
      const credentials = btoa(`${this._clientId}:${this._clientPassword}`);
      headers.Authorization = `Basic ${credentials}`;
    } else {
      body.set("client_id", this._clientId);
    }

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers,
      body: body.toString(),
    });

    const rawBody = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new Error(
        `Token endpoint returned non-JSON response (${response.status}): ${rawBody}`,
      );
    }

    if (typeof data !== "object" || data === null) {
      throw new Error(
        `Token endpoint returned unexpected body (${response.status}): ${rawBody}`,
      );
    }

    if (response.status >= 400) {
      const err = data as { error?: unknown; error_description?: unknown };
      const errorCode =
        typeof err.error === "string" ? err.error : `http_${response.status}`;
      const description =
        typeof err.error_description === "string" && err.error_description
          ? `${err.error_description} (body: ${rawBody})`
          : rawBody;
      throw new OAuth2RequestError(errorCode, description, null, null);
    }

    return new OAuth2Tokens(data as Record<string, unknown>);
  }
}
