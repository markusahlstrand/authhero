import { describe, it, expect, afterEach, vi } from "vitest";
import {
  OAuth2Client,
  OAuth2RequestError,
  generateCodeVerifier,
  generateState,
} from "../../src/oauth2-client";
import { Apple, GitHub } from "../../src/oauth2-client/providers";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(response: Response) {
  const requests: Request[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    requests.push(new Request(input, init));
    return response.clone();
  });
  return requests;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateState / generateCodeVerifier", () => {
  it("returns 43-char base64url strings (32 random bytes)", () => {
    for (const value of [generateState(), generateCodeVerifier()]) {
      expect(value).toHaveLength(43);
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(generateState()).not.toEqual(generateState());
  });
});

describe("OAuth2Client", () => {
  it("builds a PKCE authorization URL with the RFC 7636 S256 test vector", async () => {
    const client = new OAuth2Client("client-id", null, "https://cb.example");
    const url = await client.createAuthorizationURLWithPKCE(
      "https://auth.example/authorize",
      "state-123",
      "S256",
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      ["openid", "email"],
    );

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://cb.example");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
    expect(url.searchParams.get("scope")).toBe("openid email");
  });

  it("exchanges the code with HTTP basic auth and a form-encoded body", async () => {
    const requests = mockFetch(
      jsonResponse(200, { access_token: "at", token_type: "Bearer" }),
    );

    const client = new OAuth2Client("id", "secret", "https://cb.example");
    const tokens = await client.validateAuthorizationCode(
      "https://auth.example/token",
      "the-code",
      "the-verifier",
    );

    expect(tokens.accessToken()).toBe("at");
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe("https://auth.example/token");
    expect(request.headers.get("Authorization")).toBe(
      `Basic ${btoa("id:secret")}`,
    );
    expect(request.headers.get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = new URLSearchParams(await request.text());
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("redirect_uri")).toBe("https://cb.example");
    expect(body.get("client_secret")).toBeNull();
  });

  it("sends client_id in the body for public clients", async () => {
    const requests = mockFetch(
      jsonResponse(200, { access_token: "at", token_type: "Bearer" }),
    );

    const client = new OAuth2Client("public-id", null, null);
    await client.validateAuthorizationCode(
      "https://auth.example/token",
      "the-code",
      null,
    );

    const body = new URLSearchParams(await requests[0]!.text());
    expect(body.get("client_id")).toBe("public-id");
    expect(requests[0]!.headers.get("Authorization")).toBeNull();
  });

  it("throws OAuth2RequestError with the upstream error fields on 400", async () => {
    mockFetch(
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "expired code",
      }),
    );

    const client = new OAuth2Client("id", "secret", null);
    const promise = client.validateAuthorizationCode(
      "https://auth.example/token",
      "the-code",
      null,
    );

    await expect(promise).rejects.toBeInstanceOf(OAuth2RequestError);
    await expect(promise).rejects.toMatchObject({
      code: "invalid_grant",
      description: "expired code",
    });
  });
});

describe("GitHub", () => {
  it("surfaces errors GitHub returns with a 200 status", async () => {
    mockFetch(
      jsonResponse(200, {
        error: "bad_verification_code",
        error_description: "The code passed is incorrect or expired.",
      }),
    );

    const github = new GitHub("id", "secret", null);
    await expect(
      github.validateAuthorizationCode("the-code"),
    ).rejects.toMatchObject({ code: "bad_verification_code" });
  });
});

describe("Apple", () => {
  it("signs a verifiable ES256 client-secret JWT", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const pkcs8 = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
    );

    const requests = mockFetch(
      jsonResponse(200, {
        access_token: "at",
        token_type: "Bearer",
        id_token: "idt",
      }),
    );

    const apple = new Apple(
      "com.example.app",
      "team-id",
      "key-id",
      pkcs8,
      "https://cb.example",
    );
    await apple.validateAuthorizationCode("the-code");

    const body = new URLSearchParams(await requests[0]!.text());
    const clientSecret = body.get("client_secret");
    expect(clientSecret).toBeTruthy();

    const [headerB64, payloadB64, signatureB64] = clientSecret!.split(".");
    const decodeSegment = (segment: string): string =>
      atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const header: unknown = JSON.parse(decodeSegment(headerB64!));
    const payload: unknown = JSON.parse(decodeSegment(payloadB64!));
    expect(header).toMatchObject({ alg: "ES256", kid: "key-id", typ: "JWT" });
    expect(payload).toMatchObject({
      iss: "team-id",
      sub: "com.example.app",
      aud: ["https://appleid.apple.com"],
    });

    const signature = Uint8Array.from(decodeSegment(signatureB64!), (c) =>
      c.charCodeAt(0),
    );
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.publicKey,
      signature,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    expect(verified).toBe(true);
  });
});
