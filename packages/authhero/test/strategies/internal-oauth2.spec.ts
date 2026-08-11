import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OAuth2RequestError } from "../../src/oauth2-client";
import { ExtendedOAuth2Client } from "../../src/strategies/internal-oauth2";

type CapturedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: URLSearchParams;
};

async function readBody(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof input !== "string" && !(input instanceof URL) && "url" in input) {
    return (await input.text()) as string;
  }
  if (init?.body instanceof URLSearchParams) return init.body.toString();
  return (init?.body as string | undefined) ?? "";
}

function captureFetch(response: Response) {
  const captured: CapturedRequest[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
    const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const headers: Record<string, string> = {};
    const headerSource =
      init?.headers ??
      (typeof input !== "string" &&
      !(input instanceof URL) &&
      "headers" in input
        ? input.headers
        : undefined);
    if (headerSource) {
      new Headers(headerSource).forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
    }
    const bodyText = await readBody(input, init);
    captured.push({
      url,
      method:
        init?.method ??
        (typeof input !== "string" &&
        !(input instanceof URL) &&
        "method" in input
          ? input.method
          : "GET"),
      headers,
      body: new URLSearchParams(bodyText),
    });
    return response.clone();
  });
  return captured;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ExtendedOAuth2Client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validateAuthorizationCode auth methods", () => {
    let captured: CapturedRequest[];

    beforeEach(() => {
      captured = captureFetch(
        jsonResponse({
          access_token: "at",
          token_type: "Bearer",
          id_token: "id.jwt.here",
        }),
      );
    });

    it("defaults to client_secret_basic (Authorization: Basic header)", async () => {
      const client = new ExtendedOAuth2Client(
        "client-id",
        "s3cret",
        "https://app/callback",
      );
      await client.validateAuthorizationCode(
        "https://idp/token",
        "code-abc",
        "verifier",
      );

      expect(captured).toHaveLength(1);
      const [req] = captured;
      expect(req.method).toBe("POST");
      // Credentials must be in the Authorization header, not in the body.
      expect(req.headers["authorization"]).toBe(
        `Basic ${btoa("client-id:s3cret")}`,
      );
      expect(req.body.get("client_id")).toBeNull();
      expect(req.body.get("client_secret")).toBeNull();
      expect(req.body.get("grant_type")).toBe("authorization_code");
      expect(req.body.get("code")).toBe("code-abc");
      expect(req.body.get("code_verifier")).toBe("verifier");
      expect(req.body.get("redirect_uri")).toBe("https://app/callback");
    });

    it("sends credentials in body when token_endpoint_auth_method is client_secret_post", async () => {
      const client = new ExtendedOAuth2Client(
        "client-id",
        "s3cret",
        "https://app/callback",
        "client_secret_post",
      );
      await client.validateAuthorizationCode(
        "https://idp/token",
        "code-abc",
        "verifier",
      );

      const [req] = captured;
      expect(req.headers["authorization"]).toBeUndefined();
      expect(req.body.get("client_id")).toBe("client-id");
      expect(req.body.get("client_secret")).toBe("s3cret");
      expect(req.body.get("grant_type")).toBe("authorization_code");
      expect(req.body.get("code")).toBe("code-abc");
      expect(req.body.get("code_verifier")).toBe("verifier");
    });

    it("sends client_id in body and no Authorization header for public clients", async () => {
      const client = new ExtendedOAuth2Client(
        "public-client",
        null,
        "https://app/callback",
        "client_secret_post",
      );
      await client.validateAuthorizationCode(
        "https://idp/token",
        "code-abc",
        "verifier",
      );

      const [req] = captured;
      expect(req.headers["authorization"]).toBeUndefined();
      expect(req.body.get("client_id")).toBe("public-client");
      expect(req.body.get("client_secret")).toBeNull();
    });
  });

  describe("validateAuthorizationCode errors", () => {
    it("throws OAuth2RequestError with raw body appended to description", async () => {
      const responseBody = {
        error: "invalid_client",
        error_description: "Client authentication failed",
        error_hint: "method 'client_secret_basic' was requested",
      };
      captureFetch(jsonResponse(responseBody, 401));

      const client = new ExtendedOAuth2Client(
        "client-id",
        "s3cret",
        "https://app/callback",
        "client_secret_post",
      );
      const err = await client
        .validateAuthorizationCode("https://idp/token", "code", null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(OAuth2RequestError);
      const oauthErr = err as OAuth2RequestError;
      expect(oauthErr.code).toBe("invalid_client");
      // Description preserves the upstream error_description AND the full body
      // so non-standard fields like `error_hint` survive into logs.
      expect(oauthErr.description).toContain("Client authentication failed");
      expect(oauthErr.description).toContain("client_secret_basic");
    });

    it("falls back to raw body when error_description is missing", async () => {
      captureFetch(jsonResponse({ error: "invalid_request" }, 400));

      const client = new ExtendedOAuth2Client(
        "client-id",
        "s3cret",
        "https://app/callback",
        "client_secret_post",
      );
      const err = (await client
        .validateAuthorizationCode("https://idp/token", "code", null)
        .catch((e: unknown) => e)) as OAuth2RequestError;

      expect(err).toBeInstanceOf(OAuth2RequestError);
      expect(err.code).toBe("invalid_request");
      expect(err.description).toContain("invalid_request");
    });

    it("throws a descriptive error for non-JSON responses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("<html>Bad Gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      );

      const client = new ExtendedOAuth2Client(
        "client-id",
        "s3cret",
        "https://app/callback",
        "client_secret_post",
      );
      await expect(
        client.validateAuthorizationCode("https://idp/token", "code", null),
      ).rejects.toThrow(/Bad Gateway/);
    });
  });
});
