import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { mintRegistrationToken } from "../../../src/helpers/dcr/mint-token";
import type { Bindings } from "../../../src/types";

async function enableDcr(
  env: Bindings,
  extraFlags: Record<string, unknown> = {},
) {
  await env.data.tenants.update("tenantId", {
    flags: {
      enable_dynamic_client_registration: true,
      dcr_require_initial_access_token: false,
      ...extraFlags,
    },
  });
}

async function mintIat(
  env: Bindings,
  opts: {
    sub?: string;
    constraints?: Record<string, unknown>;
    expiresInMs?: number;
    single_use?: boolean;
  } = {},
) {
  const token = await mintRegistrationToken();
  const now = Date.now();
  const expires_at =
    opts.expiresInMs === undefined
      ? new Date(now + 5 * 60 * 1000).toISOString()
      : new Date(now + opts.expiresInMs).toISOString();
  await env.data.clientRegistrationTokens.create("tenantId", {
    id: token.id,
    token_hash: token.token_hash,
    type: "iat",
    sub: opts.sub,
    constraints: opts.constraints,
    single_use: opts.single_use ?? true,
    expires_at,
  });
  return token.token;
}

describe("POST /oidc/register (RFC 7591)", () => {
  it("returns 404 when DCR is not enabled on the tenant", async () => {
    const { oauthApp, env } = await getTestServer();
    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
        },
        body: JSON.stringify({
          client_name: "My App",
          redirect_uris: ["https://example.com/cb"],
        }),
      },
      env,
    );
    expect(response.status).toBe(404);
  });

  it("rejects unauthenticated request when IAT is required (default)", async () => {
    const { oauthApp, env } = await getTestServer();
    // Default: enable_dynamic_client_registration=true, require IAT true
    await env.data.tenants.update("tenantId", {
      flags: { enable_dynamic_client_registration: true },
    });

    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
        },
        body: JSON.stringify({
          client_name: "My App",
          redirect_uris: ["https://example.com/cb"],
        }),
      },
      env,
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("invalid_token");
  });

  it("registers a client with open DCR (flag off) and returns RFC 7591 response", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableDcr(env);

    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
        },
        body: JSON.stringify({
          client_name: "My App",
          redirect_uris: ["https://example.com/cb"],
          grant_types: ["authorization_code"],
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.client_id).toBeTypeOf("string");
    expect(body.client_secret).toBeTypeOf("string");
    expect(body.registration_access_token).toBeTypeOf("string");
    expect(body.registration_client_uri).toContain(
      `/oidc/register/${body.client_id}`,
    );
    expect(body.client_name).toBe("My App");
    expect(body.redirect_uris).toEqual(["https://example.com/cb"]);
    expect(body.grant_types).toEqual(["authorization_code"]);

    // Verify callbacks was persisted (AuthHero internal name)
    const stored = await env.data.clients.get("tenantId", body.client_id);
    expect(stored?.callbacks).toEqual(["https://example.com/cb"]);
    expect(stored?.registration_type).toBe("open_dcr");
  });

  it("rejects invalid redirect_uri with 400 invalid_redirect_uri", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableDcr(env);

    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
        },
        body: JSON.stringify({
          client_name: "Bad App",
          redirect_uris: ["not-a-url"],
        }),
      },
      env,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_redirect_uri");
  });

  it("accepts a valid Initial Access Token and stamps owner_user_id", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });

    const iat = await mintIat(env, { sub: "email|userId" });

    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${iat}`,
        },
        body: JSON.stringify({
          client_name: "CMS App",
          redirect_uris: ["https://publisher.com/cb"],
          grant_types: ["client_credentials"],
          token_endpoint_auth_method: "client_secret_basic",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    const stored = await env.data.clients.get("tenantId", body.client_id);
    expect(stored?.owner_user_id).toBe("email|userId");
    expect(stored?.registration_type).toBe("iat_dcr");
  });

  it("rejects a reused single-use IAT on second call", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });

    const iat = await mintIat(env);

    const first = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${iat}`,
        },
        body: JSON.stringify({
          client_name: "App 1",
          redirect_uris: ["https://example.com/cb"],
        }),
      },
      env,
    );
    expect(first.status).toBe(201);

    const second = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${iat}`,
        },
        body: JSON.stringify({
          client_name: "App 2",
          redirect_uris: ["https://example.com/cb"],
        }),
      },
      env,
    );
    expect(second.status).toBe(401);
  });

  it("rejects an expired IAT", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });

    const iat = await mintIat(env, { expiresInMs: -1000 });

    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${iat}`,
        },
        body: JSON.stringify({
          client_name: "Expired",
          redirect_uris: ["https://example.com/cb"],
        }),
      },
      env,
    );
    expect(response.status).toBe(401);
  });

  it("enforces IAT pre-bound constraints: reject conflicting field", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });

    const iat = await mintIat(env, {
      constraints: { grant_types: ["client_credentials"] },
    });

    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${iat}`,
        },
        body: JSON.stringify({
          client_name: "Wrong",
          redirect_uris: ["https://example.com/cb"],
          grant_types: ["authorization_code"],
        }),
      },
      env,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_client_metadata");
  });

  it("enforces IAT pre-bound constraints: fill in absent field from constraint", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });

    const iat = await mintIat(env, {
      constraints: { grant_types: ["client_credentials"] },
    });

    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${iat}`,
        },
        body: JSON.stringify({
          client_name: "Filled",
          redirect_uris: ["https://example.com/cb"],
        }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.grant_types).toEqual(["client_credentials"]);
  });
});

describe("RFC 7592 client configuration endpoint", () => {
  async function registerClient(oauthApp: any, env: Bindings) {
    await enableDcr(env);
    const response = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
        },
        body: JSON.stringify({
          client_name: "Self-managed",
          redirect_uris: ["https://example.com/cb"],
        }),
      },
      env,
    );
    const body = await response.json();
    return {
      client_id: body.client_id,
      registration_access_token: body.registration_access_token,
      client_secret: body.client_secret,
    };
  }

  it("GET returns the client configuration (no client_secret)", async () => {
    const { oauthApp, env } = await getTestServer();
    const { client_id, registration_access_token } = await registerClient(
      oauthApp,
      env,
    );

    const response = await oauthApp.request(
      `/oidc/register/${client_id}`,
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${registration_access_token}`,
        },
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.client_id).toBe(client_id);
    expect(body.client_secret).toBeUndefined();
    expect(body.redirect_uris).toEqual(["https://example.com/cb"]);
  });

  it("GET rejects a RAT bound to a different client_id", async () => {
    const { oauthApp, env } = await getTestServer();
    const first = await registerClient(oauthApp, env);
    const second = await registerClient(oauthApp, env);

    const response = await oauthApp.request(
      `/oidc/register/${second.client_id}`,
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${first.registration_access_token}`,
        },
      },
      env,
    );
    expect(response.status).toBe(401);
  });

  it("PUT replaces the client configuration", async () => {
    const { oauthApp, env } = await getTestServer();
    const { client_id, registration_access_token } = await registerClient(
      oauthApp,
      env,
    );

    const response = await oauthApp.request(
      `/oidc/register/${client_id}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${registration_access_token}`,
        },
        body: JSON.stringify({
          client_name: "Renamed",
          redirect_uris: ["https://example.com/cb", "https://new.com/cb"],
        }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.client_name).toBe("Renamed");
    expect(body.redirect_uris).toEqual([
      "https://example.com/cb",
      "https://new.com/cb",
    ]);

    const stored = await env.data.clients.get("tenantId", client_id);
    expect(stored?.name).toBe("Renamed");
  });

  it("PUT rejects a mismatched client_id in the body", async () => {
    const { oauthApp, env } = await getTestServer();
    const { client_id, registration_access_token } = await registerClient(
      oauthApp,
      env,
    );

    const response = await oauthApp.request(
      `/oidc/register/${client_id}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${registration_access_token}`,
        },
        body: JSON.stringify({
          client_id: "different-id",
          client_name: "Bad",
          redirect_uris: ["https://example.com/cb"],
        }),
      },
      env,
    );
    expect(response.status).toBe(400);
  });

  it("DELETE soft-deletes the client and invalidates the RAT", async () => {
    const { oauthApp, env } = await getTestServer();
    const { client_id, registration_access_token } = await registerClient(
      oauthApp,
      env,
    );

    const del = await oauthApp.request(
      `/oidc/register/${client_id}`,
      {
        method: "DELETE",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${registration_access_token}`,
        },
      },
      env,
    );
    expect(del.status).toBe(204);

    // Subsequent GET should fail (401)
    const after = await oauthApp.request(
      `/oidc/register/${client_id}`,
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${registration_access_token}`,
        },
      },
      env,
    );
    expect(after.status).toBe(401);
  });
});

describe("Discovery registration_endpoint gating", () => {
  it("omits registration_endpoint when DCR flag is off", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );
    const body = await response.json();
    expect(body.registration_endpoint).toBeUndefined();
  });

  it("includes registration_endpoint when DCR flag is on", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableDcr(env);
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );
    const body = await response.json();
    expect(body.registration_endpoint).toBe(
      "http://localhost:3000/oidc/register",
    );
  });
});
