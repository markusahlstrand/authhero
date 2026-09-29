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
        client_id: "clientId",
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
        client_id: "clientId",
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
        client_id: "clientId",
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

// RFC 9101 §5: with a Request Object present, only its parameters count.
describe("/authorize with a Request Object ignores unsigned query parameters (RFC 9101 §5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type TestServer = Awaited<ReturnType<typeof getTestServer>>;

  async function setup() {
    const server = await getTestServer();
    const keys = await generateRsaKeypairWithJwks();
    await attachClientJwks(server.env, keys.publicJwk);

    const sign = (payload: Record<string, unknown>) =>
      signJWT(
        "RS256",
        keys.privateBuffer,
        { iss: "clientId", aud: ISSUER, ...payload },
        {
          includeIssuedTimestamp: true,
          expiresInSeconds: 300,
          headers: { kid: keys.publicJwk.kid },
        },
      );

    return { ...server, sign };
  }

  const signedBase = {
    client_id: "clientId",
    redirect_uri: "https://example.com/callback",
    response_type: "code",
    scope: "openid",
  };

  async function authorize(
    { oauthApp, env }: TestServer,
    query: Record<string, string>,
  ) {
    return testClient(oauthApp, env).authorize.$get(
      { query: { client_id: "clientId", ...query } },
      { headers: { origin: "https://example.com" } },
    );
  }

  async function loginSessionFrom({ env }: TestServer, response: Response) {
    expect(response.status).toBe(302);
    const location = new URL(
      response.headers.get("location")!,
      "https://example.com",
    );
    const loginSession = await env.data.loginSessions.get(
      "tenantId",
      location.searchParams.get("state")!,
    );
    if (!loginSession) throw new Error("login session not found");
    return loginSession;
  }

  function serveRequestUri(server: TestServer, jwt: string) {
    server.env.ALLOW_PRIVATE_OUTBOUND_FETCH = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(jwt, {
          status: 200,
          headers: { "content-type": "application/oauth-authz-req+jwt" },
        }),
    );
    return "http://localhost:65535/req.jwt";
  }

  const queryOnly = {
    state: "query-state",
    nonce: "query-nonce",
    audience: "https://query.example.com/api",
    login_hint: "attacker@example.com",
    ui_locales: "sv",
    organization: "org_query",
    acr_values: "query-acr",
  };

  function expectNoQueryOnlyParams(authParams: Record<string, unknown>): void {
    expect(authParams.state).toBeUndefined();
    expect(authParams.nonce).toBeUndefined();
    expect(authParams.audience).not.toBe(queryOnly.audience);
    expect(authParams.username).toBeUndefined();
    expect(authParams.ui_locales).toBeUndefined();
    expect(authParams.organization).toBeUndefined();
    expect(authParams.acr_values).toBeUndefined();
  }

  it("ignores query-only parameters with an inline request", async () => {
    const server = await setup();
    const response = await authorize(server, {
      ...queryOnly,
      request: await server.sign(signedBase),
    });

    const { authParams } = await loginSessionFrom(server, response);
    expect(authParams.scope).toBe("openid");
    expectNoQueryOnlyParams(authParams);
  });

  it("ignores query-only parameters with a request_uri", async () => {
    const server = await setup();
    const requestUri = serveRequestUri(server, await server.sign(signedBase));
    const response = await authorize(server, {
      ...queryOnly,
      request_uri: requestUri,
    });

    const { authParams } = await loginSessionFrom(server, response);
    expect(authParams.scope).toBe("openid");
    expectNoQueryOnlyParams(authParams);
  });

  it("uses the signed values when duplicate query values differ", async () => {
    const server = await setup();
    const response = await authorize(server, {
      scope: "openid email profile offline_access",
      state: "query-state",
      nonce: "query-nonce",
      redirect_uri: "https://example.com/other-callback",
      request: await server.sign({
        ...signedBase,
        state: "signed-state",
        nonce: "signed-nonce",
      }),
    });

    const { authParams } = await loginSessionFrom(server, response);
    expect(authParams.scope).toBe("openid");
    expect(authParams.state).toBe("signed-state");
    expect(authParams.nonce).toBe("signed-nonce");
    expect(authParams.redirect_uri).toBe("https://example.com/callback");
  });

  it("does not let the query supply a scope missing from the request object", async () => {
    const server = await setup();
    const { scope: _scope, ...withoutScope } = signedBase;
    const response = await authorize(server, {
      scope: "openid email",
      request: await server.sign(withoutScope),
    });

    const { authParams } = await loginSessionFrom(server, response);
    expect(authParams.scope).not.toBe("openid email");
  });

  it("does not let the query supply a redirect_uri missing from the request object", async () => {
    const server = await setup();
    const { redirect_uri: _redirectUri, ...withoutRedirectUri } = signedBase;
    const response = await authorize(server, {
      redirect_uri: "https://example.com/callback",
      request: await server.sign(withoutRedirectUri),
    });
    const { authParams } = await loginSessionFrom(server, response);
    expect(authParams.redirect_uri).toBeUndefined();
  });

  it("does not let the query supply a response_type missing from the request object", async () => {
    const server = await setup();
    const { response_type: _responseType, ...withoutResponseType } = signedBase;
    const response = await authorize(server, {
      response_type: "code",
      request: await server.sign(withoutResponseType),
    });
    // The error goes back to the signed redirect_uri; the query response_type
    // was not used to continue the flow.
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://example.com/callback",
    );
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.get("error_description")).toMatch(
      /response_type/,
    );
  });

  it("rejects a request object without client_id", async () => {
    const server = await setup();
    const { client_id: _clientId, ...withoutClientId } = signedBase;
    const response = await authorize(server, {
      request: await server.sign(withoutClientId),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/missing client_id/);
  });

  it("rejects a request object whose client_id does not match", async () => {
    const server = await setup();
    const response = await authorize(server, {
      request: await server.sign({ ...signedBase, client_id: "otherClient" }),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/does not match/);
  });

  it("rejects a request_uri object whose client_id does not match", async () => {
    const server = await setup();
    const requestUri = serveRequestUri(
      server,
      await server.sign({ ...signedBase, client_id: "otherClient" }),
    );
    const response = await authorize(server, { request_uri: requestUri });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/does not match/);
  });

  it("does not hydrate a signed request from a stored login session", async () => {
    const server = await setup();
    const stored = await server.env.data.loginSessions.create("tenantId", {
      csrf_token: "csrf-token",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        scope: "openid email profile",
        nonce: "stored-nonce",
        audience: "https://stored.example.com/api",
      },
    });

    const response = await authorize(server, {
      request: await server.sign({ ...signedBase, state: stored.id }),
    });

    const { authParams } = await loginSessionFrom(server, response);
    expect(authParams.scope).toBe("openid");
    expect(authParams.nonce).toBeUndefined();
    expect(authParams.audience).not.toBe("https://stored.example.com/api");
  });

  it("still accepts plain query authorization without a request object", async () => {
    const server = await setup();
    const response = await authorize(server, {
      ...signedBase,
      state: "query-state",
      nonce: "query-nonce",
    });

    const { authParams } = await loginSessionFrom(server, response);
    expect(authParams.state).toBe("query-state");
    expect(authParams.nonce).toBe("query-nonce");
  });
});
