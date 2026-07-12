import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { signJWT, parseJWT } from "../../../src/utils/jwt";
import { encodeBase64Url } from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";

const TOKEN_ENDPOINT = "http://localhost:3000/oauth/token";
const CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

interface TokenSuccess {
  access_token: string;
  token_type: string;
}
interface TokenFailure {
  error: string;
  error_description?: string;
}

async function generateRsaKeypair(kid = "client-kid") {
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
    token_endpoint_auth_method: "private_key_jwt",
  });
}

async function makeAssertion(
  privateBuffer: ArrayBuffer,
  kid: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return signJWT(
    "RS256",
    privateBuffer,
    {
      iss: "clientId",
      sub: "clientId",
      aud: TOKEN_ENDPOINT,
      jti: `jti-${Math.random().toString(36).slice(2)}`,
      ...overrides,
    },
    {
      includeIssuedTimestamp: true,
      expiresInSeconds: 300,
      headers: { kid },
    },
  );
}

describe("/oauth/token with RFC 7523 client_assertion", () => {
  it("authenticates client_credentials via private_key_jwt", async () => {
    const { oauthApp, env } = await getTestServer();
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    await attachClientJwks(env, publicJwk);

    const assertion = await makeAssertion(privateBuffer, publicJwk.kid!);

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_assertion: assertion,
          client_assertion_type: CLIENT_ASSERTION_TYPE,
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenSuccess;
    const token = parseJWT(body.access_token);
    expect(token?.payload).toMatchObject({
      sub: "clientId",
      aud: "https://example.com",
    });
  });

  it("authenticates without an explicit client_id (derived from sub)", async () => {
    const { oauthApp, env } = await getTestServer();
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    await attachClientJwks(env, publicJwk);

    const assertion = await makeAssertion(privateBuffer, publicJwk.kid!);

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_assertion: assertion,
          client_assertion_type: CLIENT_ASSERTION_TYPE,
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
  });

  it("rejects invalid client_assertion_type", async () => {
    const { oauthApp, env } = await getTestServer();
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    await attachClientJwks(env, publicJwk);

    const assertion = await makeAssertion(privateBuffer, publicJwk.kid!);

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient form type
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_assertion: assertion,
          client_assertion_type: "wrong-type",
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as TokenFailure;
    expect(body.error).toBe("invalid_request");
    expect(body.error_description).toMatch(/client_assertion_type must be/);
  });

  it("rejects when client_secret and client_assertion are both sent", async () => {
    const { oauthApp, env } = await getTestServer();
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    await attachClientJwks(env, publicJwk);

    const assertion = await makeAssertion(privateBuffer, publicJwk.kid!);

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient form type
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          client_assertion: assertion,
          client_assertion_type: CLIENT_ASSERTION_TYPE,
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as TokenFailure;
    expect(body.error).toBe("invalid_request");
    expect(body.error_description).toMatch(/mutually exclusive/);
  });

  it("rejects assertion with alg=none", async () => {
    const { oauthApp, env } = await getTestServer();
    const { publicJwk } = await generateRsaKeypair();
    await attachClientJwks(env, publicJwk);

    const header = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: "none", typ: "JWT" })),
    );
    const payload = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: "clientId",
          sub: "clientId",
          aud: TOKEN_ENDPOINT,
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ),
    );
    const unsignedAssertion = `${header}.${payload}.`;

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient form type
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_assertion: unsignedAssertion,
          client_assertion_type: CLIENT_ASSERTION_TYPE,
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as TokenFailure;
    // RFC 6749 §5.2: the token endpoint may only emit the enumerated error
    // codes — internal "unsupported_alg" maps to "invalid_request".
    expect(body.error).toBe("invalid_request");
  });

  it("rejects assertion signed with an unknown key", async () => {
    const { oauthApp, env } = await getTestServer();
    const { publicJwk: registered } = await generateRsaKeypair();
    await attachClientJwks(env, registered);

    const attacker = await generateRsaKeypair("attacker-kid");
    const assertion = await makeAssertion(
      attacker.privateBuffer,
      registered.kid!, // pretends to be the registered key
    );

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient form type
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_assertion: assertion,
          client_assertion_type: CLIENT_ASSERTION_TYPE,
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as TokenFailure;
    expect(body.error).toBe("invalid_client");
  });

  it("authenticates client_credentials via client_secret_jwt (HS256)", async () => {
    const { oauthApp, env } = await getTestServer();
    // Default test client has client_secret = "clientSecret"; register it for
    // client_secret_jwt so the auth-method match check accepts the assertion.
    await env.data.clients.update("tenantId", "clientId", {
      token_endpoint_auth_method: "client_secret_jwt",
    });
    const secretBytes = new Uint8Array(
      new TextEncoder().encode("clientSecret"),
    );
    const assertion = await signJWT(
      "HS256",
      secretBytes,
      {
        iss: "clientId",
        sub: "clientId",
        aud: TOKEN_ENDPOINT,
        jti: "hs-jti",
      },
      { includeIssuedTimestamp: true, expiresInSeconds: 300 },
    );

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient form type
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_assertion: assertion,
          client_assertion_type: CLIENT_ASSERTION_TYPE,
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
  });

  it("advertises private_key_jwt + client_secret_jwt in discovery", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient[".well-known"][
      "openid-configuration"
    ].$get({ param: {} }, { headers: { "tenant-id": "tenantId" } });
    const body = (await response.json()) as {
      token_endpoint_auth_methods_supported: string[];
    };
    expect(body.token_endpoint_auth_methods_supported).toEqual(
      expect.arrayContaining([
        "client_secret_basic",
        "client_secret_post",
        "client_secret_jwt",
        "private_key_jwt",
      ]),
    );
  });
});
