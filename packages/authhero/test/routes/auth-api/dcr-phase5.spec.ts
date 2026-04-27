import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { mintRegistrationToken } from "../../../src/helpers/dcr/mint-token";
import { getAdminToken } from "../../helpers/token";
import type { Bindings } from "../../../src/types";

async function enableDcr(env: Bindings) {
  await env.data.tenants.update("tenantId", {
    flags: {
      enable_dynamic_client_registration: true,
      dcr_require_initial_access_token: true,
    },
  });
}

async function mintIatRecord(
  env: Bindings,
  opts: { sub?: string; constraints?: Record<string, unknown> } = {},
) {
  const token = await mintRegistrationToken();
  await env.data.clientRegistrationTokens.create("tenantId", {
    id: token.id,
    token_hash: token.token_hash,
    type: "iat",
    sub: opts.sub,
    constraints: opts.constraints,
    single_use: true,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  return token.token;
}

async function registerClient(
  env: Bindings,
  oauthApp: any,
  iat: string,
  body: Record<string, unknown>,
) {
  const response = await oauthApp.request(
    "/oidc/register",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "tenant-id": "tenantId",
        authorization: `Bearer ${iat}`,
      },
      body: JSON.stringify(body),
    },
    env,
  );
  expect(response.status).toBe(201);
  return response.json();
}

describe("Phase 5 — soft-delete enforcement at /oauth/token", () => {
  it("after RFC 7592 DELETE, client_credentials token request returns invalid_client", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableDcr(env);

    const iat = await mintIatRecord(env, {
      sub: "email|user-1",
      constraints: { grant_types: ["client_credentials"] },
    });

    const created = await registerClient(env, oauthApp, iat, {
      client_name: "App to be deleted",
      grant_types: ["client_credentials"],
      token_endpoint_auth_method: "client_secret_basic",
    });

    // Sanity check — the freshly registered client can mint tokens.
    const ok = await testClient(oauthApp, env).oauth.token.$post(
      // @ts-expect-error testClient typing
      {
        form: {
          grant_type: "client_credentials",
          client_id: created.client_id,
          client_secret: created.client_secret,
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(ok.status).toBe(200);

    // RFC 7592 DELETE — soft-deletes the client.
    const del = await oauthApp.request(
      `/oidc/register/${created.client_id}`,
      {
        method: "DELETE",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${created.registration_access_token}`,
        },
      },
      env,
    );
    expect(del.status).toBe(204);

    // Subsequent token request must fail — getEnrichedClient blocks lookup.
    const denied = await testClient(oauthApp, env).oauth.token.$post(
      // @ts-expect-error testClient typing
      {
        form: {
          grant_type: "client_credentials",
          client_id: created.client_id,
          client_secret: created.client_secret,
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(denied.status).not.toBe(200);
  });
});

describe("Phase 5 — GET /api/v2/users/:user_id/connected-clients", () => {
  it("returns clients owned by the user, excludes other users' clients and soft-deleted clients", async () => {
    const { oauthApp, managementApp, env } = await getTestServer();
    await enableDcr(env);

    const iatA1 = await mintIatRecord(env, { sub: "email|user-A" });
    const iatA2 = await mintIatRecord(env, { sub: "email|user-A" });
    const iatB = await mintIatRecord(env, { sub: "email|user-B" });

    const a1 = await registerClient(env, oauthApp, iatA1, {
      client_name: "User A — App 1",
      redirect_uris: ["https://a-publisher.com/cb"],
    });
    const a2 = await registerClient(env, oauthApp, iatA2, {
      client_name: "User A — App 2",
      redirect_uris: ["https://a-other.com/cb"],
    });
    await registerClient(env, oauthApp, iatB, {
      client_name: "User B — App",
      redirect_uris: ["https://b.com/cb"],
    });

    // Soft-delete one of A's clients — it should not appear.
    const del = await oauthApp.request(
      `/oidc/register/${a2.client_id}`,
      {
        method: "DELETE",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${a2.registration_access_token}`,
        },
      },
      env,
    );
    expect(del.status).toBe(204);

    const adminToken = await getAdminToken();
    const response = await managementApp.request(
      "/users/email%7Cuser-A/connected-clients",
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{
      client_id: string;
      name: string;
      registration_type?: string;
    }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.client_id).toBe(a1.client_id);
    expect(body[0]!.name).toBe("User A — App 1");
    expect(body[0]!.registration_type).toBe("iat_dcr");
    // Confirm slim shape — secret never leaks.
    expect(body[0] as Record<string, unknown>).not.toHaveProperty(
      "client_secret",
    );
  });

  it("returns empty array when user has no connected clients", async () => {
    const { managementApp, env } = await getTestServer();
    const adminToken = await getAdminToken();
    const response = await managementApp.request(
      "/users/email%7Cnobody/connected-clients",
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it("rejects request without read:clients/read:users/auth:read scope", async () => {
    const { managementApp, env } = await getTestServer();
    const { createToken } = await import("../../helpers/token");
    const limited = await createToken({ permissions: ["delete:users"] });
    const response = await managementApp.request(
      "/users/email%7Cuser-A/connected-clients",
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${limited}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    expect(response.status).toBe(403);
  });
});
