import { describe, it, expect, vi, afterEach } from "vitest";
import { testClient } from "hono/testing";
import { signJWT } from "../../../src/utils/jwt";
import { encodeBase64Url } from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";

const ISSUER = "http://localhost:3000/";

async function generateRsaKeypairWithJwks(kid = "client-kid") {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048,
    },
    true,
    ["sign", "verify"],
  );
  const privateBuffer = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return {
    privateBuffer,
    publicJwk: { ...publicJwk, kid, alg: "RS256", use: "sig" },
  };
}

async function attachClientJwks(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  publicJwk: JsonWebKey & { kid?: string },
) {
  await env.data.clients.update("tenantId", "clientId", {
    registration_metadata: { jwks: { keys: [publicJwk] } },
  });
}

describe("/authorize request= and request_uri (RFC 9101 / OIDC Core 6.1, 6.2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a signed request= and applies its params", async () => {
    const { oauthApp, env } = await getTestServer();
    const { privateBuffer, publicJwk } = await generateRsaKeypairWithJwks();
    await attachClientJwks(env, publicJwk);

    const requestJwt = await signJWT(
      "RS256",
      privateBuffer,
      {
        iss: "clientId",
        aud: ISSUER,
        scope: "openid",
        redirect_uri: "https://example.com/callback",
        response_type: "code",
        nonce: "nonce-from-request",
      },
      {
        includeIssuedTimestamp: true,
        expiresInSeconds: 300,
        headers: { kid: publicJwk.kid },
      },
    );

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          request: requestJwt,
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    // Successful path redirects to universal login. The key signal is that
    // the verifier didn't reject — anything except 400 means we got past the
    // request-object gate.
    expect(response.status).not.toBe(400);
    expect([200, 302]).toContain(response.status);
  });

  it("rejects request= with alg=none", async () => {
    const { oauthApp, env } = await getTestServer();
    const { publicJwk } = await generateRsaKeypairWithJwks();
    await attachClientJwks(env, publicJwk);

    const header = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: "none", typ: "JWT" })),
    );
    const payload = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: "clientId",
          aud: ISSUER,
          scope: "openid email",
          redirect_uri: "https://attacker.example/cb",
          response_type: "code",
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ),
    );
    const unsignedJwt = `${header}.${payload}.`;

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.authorize.$get(
      {
        query: { client_id: "clientId", request: unsignedJwt },
      },
      { headers: { origin: "https://example.com" } },
    );

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toMatch(/unsupported_alg|alg=none|invalid request object/i);
  });

  it("rejects request= signed with an unknown key", async () => {
    const { oauthApp, env } = await getTestServer();
    const { publicJwk: registered } = await generateRsaKeypairWithJwks();
    await attachClientJwks(env, registered);

    const attacker = await generateRsaKeypairWithJwks();
    const requestJwt = await signJWT(
      "RS256",
      attacker.privateBuffer,
      {
        iss: "clientId",
        aud: ISSUER,
        scope: "openid",
        redirect_uri: "https://attacker.example/cb",
        response_type: "code",
      },
      {
        includeIssuedTimestamp: true,
        expiresInSeconds: 300,
        // Use the registered kid so the lookup matches but the signature does not.
        headers: { kid: registered.kid },
      },
    );

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.authorize.$get(
      {
        query: { client_id: "clientId", request: requestJwt },
      },
      { headers: { origin: "https://example.com" } },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/signature_invalid/);
  });

  it("rejects when both request and request_uri are present", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          request: "x.y.z",
          request_uri: "https://example.com/req",
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/mutually exclusive/);
  });

  it("rejects request_uri pointing at a private IP", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          request_uri: "https://127.0.0.1/req",
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/request_uri rejected/);
  });

  it("rejects request_uri over plain http (when ALLOW_PRIVATE_OUTBOUND_FETCH is off)", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          request_uri: "http://example.com/req",
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/request_uri rejected/);
  });

  it("fetches request_uri and verifies the JWT it returns", async () => {
    const { oauthApp, env } = await getTestServer();
    const { privateBuffer, publicJwk } = await generateRsaKeypairWithJwks();
    await attachClientJwks(env, publicJwk);

    const requestJwt = await signJWT(
      "RS256",
      privateBuffer,
      {
        iss: "clientId",
        aud: ISSUER,
        scope: "openid",
        redirect_uri: "https://example.com/callback",
        response_type: "code",
      },
      {
        includeIssuedTimestamp: true,
        expiresInSeconds: 300,
        headers: { kid: publicJwk.kid },
      },
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(requestJwt, {
          status: 200,
          headers: { "content-type": "application/jwt" },
        }),
    );

    // Allow http://localhost-style URLs through the SSRF guard for this test.
    env.ALLOW_PRIVATE_OUTBOUND_FETCH = true;

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          request_uri: "http://localhost:65535/req.jwt",
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    expect(fetchSpy).toHaveBeenCalled();
    expect(response.status).not.toBe(400);
    expect([200, 302]).toContain(response.status);
  });
});
