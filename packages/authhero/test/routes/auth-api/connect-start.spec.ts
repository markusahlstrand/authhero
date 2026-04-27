import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";
import { hashRegistrationToken } from "../../../src/helpers/dcr/mint-token";
import type { Bindings } from "../../../src/types";

async function enableConnectFlow(
  env: Bindings,
  integration_types: string[] = ["wordpress"],
) {
  await env.data.tenants.update("tenantId", {
    flags: {
      enable_dynamic_client_registration: true,
      dcr_require_initial_access_token: true,
      dcr_allowed_integration_types: integration_types,
    },
  });
}

const VALID_QS = new URLSearchParams({
  integration_type: "wordpress",
  domain: "publisher.com",
  return_to: "https://publisher.com/wp-admin/connect-callback",
  state: "csrf-abc",
}).toString();

describe("GET /connect/start", () => {
  it("returns 404 when DCR is not enabled", async () => {
    const { oauthApp, env } = await getTestServer();
    const response = await oauthApp.request(
      `/connect/start?${VALID_QS}`,
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 when no integration types are allowlisted", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: { enable_dynamic_client_registration: true },
    });
    const response = await oauthApp.request(
      `/connect/start?${VALID_QS}`,
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(response.status).toBe(404);
  });

  it("rejects integration_type not in tenant allowlist", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableConnectFlow(env, ["ghost"]);
    const response = await oauthApp.request(
      `/connect/start?${VALID_QS}`,
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(response.status).toBe(400);
  });

  it("rejects when return_to origin doesn't match domain", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableConnectFlow(env);
    const qs = new URLSearchParams({
      integration_type: "wordpress",
      domain: "publisher.com",
      return_to: "https://attacker.com/cb",
      state: "csrf-abc",
    }).toString();
    const response = await oauthApp.request(
      `/connect/start?${qs}`,
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(response.status).toBe(400);
  });

  it("rejects http return_to", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableConnectFlow(env);
    const qs = new URLSearchParams({
      integration_type: "wordpress",
      domain: "publisher.com",
      return_to: "http://publisher.com/cb",
      state: "csrf-abc",
    }).toString();
    const response = await oauthApp.request(
      `/connect/start?${qs}`,
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(response.status).toBe(400);
  });

  it("on valid input: 302s to /u2/connect/start with a fresh login_session id and stores connect data in state_data", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableConnectFlow(env);
    const response = await oauthApp.request(
      `/connect/start?${VALID_QS}&scope=read%3Acms`,
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toMatch(/^\/u2\/connect\/start\?state=/);
    const stateId = new URL(location!, "http://localhost").searchParams.get(
      "state",
    );
    expect(stateId).toBeTruthy();
    const session = await env.data.loginSessions.get("tenantId", stateId!);
    expect(session).toBeTruthy();
    expect(session!.state_data).toBeTruthy();
    const data = JSON.parse(session!.state_data!);
    expect(data.connect.integration_type).toBe("wordpress");
    expect(data.connect.domain).toBe("publisher.com");
    expect(data.connect.return_to).toBe(
      "https://publisher.com/wp-admin/connect-callback",
    );
    expect(data.connect.scope).toBe("read:cms");
    expect(data.connect.caller_state).toBe("csrf-abc");
  });
});

describe("POST /api/v2/client-registration-tokens (Mgmt-API IAT mint)", () => {
  it("rejects request without create:client_registration_tokens (or auth:write) scope", async () => {
    const { managementApp, env } = await getTestServer();
    const { createToken } = await import("../../helpers/token");
    const limitedToken = await createToken({
      permissions: ["read:clients"],
    });

    const response = await managementApp.request(
      "/client-registration-tokens",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${limitedToken}`,
          "content-type": "application/json",
          "tenant-id": "tenantId",
        },
        body: JSON.stringify({ sub: "email|user-1" }),
      },
      env,
    );
    expect(response.status).toBe(403);
  });

  it("mints a usable IAT with the requested constraints", async () => {
    const { managementApp, env } = await getTestServer();

    const response = await managementApp.request(
      "/client-registration-tokens",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + (await getMgmtToken()),
          "content-type": "application/json",
          "tenant-id": "tenantId",
        },
        body: JSON.stringify({
          sub: "email|user-1",
          constraints: {
            domain: "publisher.com",
            integration_type: "wordpress",
            grant_types: ["client_credentials"],
          },
          expires_in_seconds: 600,
          single_use: true,
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token).toBeTypeOf("string");
    expect(body.id).toBeTypeOf("string");
    expect(body.sub).toBe("email|user-1");
    expect(body.single_use).toBe(true);

    // The token must be retrievable by hash and round-trip through the
    // existing /oidc/register validation surface.
    const stored = await env.data.clientRegistrationTokens.getByHash(
      "tenantId",
      await hashRegistrationToken(body.token),
    );
    expect(stored).toBeTruthy();
    expect(stored!.type).toBe("iat");
    expect(stored!.sub).toBe("email|user-1");
    expect(stored!.constraints).toEqual({
      domain: "publisher.com",
      integration_type: "wordpress",
      grant_types: ["client_credentials"],
    });
  });

  it("the minted IAT is accepted by POST /oidc/register and binds owner_user_id", async () => {
    const { managementApp, oauthApp, env } = await getTestServer();
    await env.data.tenants.update("tenantId", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });

    const mintResponse = await managementApp.request(
      "/client-registration-tokens",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + (await getMgmtToken()),
          "content-type": "application/json",
          "tenant-id": "tenantId",
        },
        body: JSON.stringify({
          sub: "email|user-9",
          constraints: {
            domain: "publisher.com",
            grant_types: ["client_credentials"],
          },
        }),
      },
      env,
    );
    expect(mintResponse.status).toBe(201);
    const minted = await mintResponse.json();

    const registerResponse = await oauthApp.request(
      "/oidc/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "tenant-id": "tenantId",
          authorization: `Bearer ${minted.token}`,
        },
        body: JSON.stringify({
          client_name: "Publisher Site",
          redirect_uris: ["https://publisher.com/cb"],
          grant_types: ["client_credentials"],
          domain: "publisher.com",
          token_endpoint_auth_method: "client_secret_basic",
        }),
      },
      env,
    );
    expect(registerResponse.status).toBe(201);
    const created = await registerResponse.json();
    const stored = await env.data.clients.get("tenantId", created.client_id);
    expect(stored?.owner_user_id).toBe("email|user-9");
    expect(stored?.registration_type).toBe("iat_dcr");
  });
});

// ---- helpers ----

async function getMgmtToken(): Promise<string> {
  // The management API in test-server is wired with an auth middleware that
  // accepts any bearer JWT signed by the test certificate. Reuse the helper
  // already used by other Mgmt-API specs.
  const { getAdminToken } = await import("../../helpers/token");
  return getAdminToken();
}
