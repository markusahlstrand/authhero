import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

const TENANT = "tenantId";
const OTHER_TENANT = "otherTenant";

type MintResponse = {
  id: string;
  token: string;
  expires_at: string;
  sub?: string;
  constraints?: Record<string, unknown>;
  single_use: boolean;
};

describe("management-api client registration tokens", () => {
  it("mints an initial access token and persists only its hash", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client["client-registration-tokens"].$post(
      {
        json: {},
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as MintResponse;
    expect(body.id).toBeTruthy();
    expect(body.token).toBeTruthy();
    // Defaults mirror mintIat: single-use, five-minute TTL.
    expect(body.single_use).toBe(true);
    const ttlMs = new Date(body.expires_at).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(4 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(5 * 60 * 1000);

    const stored = await env.data.clientRegistrationTokens.get(TENANT, body.id);
    expect(stored).not.toBeNull();
    expect(stored!.type).toBe("iat");
    // The plaintext token is shown once and never stored.
    expect(stored!.token_hash).not.toBe(body.token);
    expect(JSON.stringify(stored)).not.toContain(body.token);
  });

  it("binds the token to a subject and pre-bound constraints", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client["client-registration-tokens"].$post(
      {
        json: {
          sub: "email|userId",
          constraints: { client_name: "Pinned App" },
          expires_in_seconds: 60,
          single_use: false,
        },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as MintResponse;
    expect(body.sub).toBe("email|userId");
    expect(body.constraints).toEqual({ client_name: "Pinned App" });
    expect(body.single_use).toBe(false);
    const ttlMs = new Date(body.expires_at).getTime() - Date.now();
    expect(ttlMs).toBeLessThanOrEqual(60 * 1000);

    const stored = await env.data.clientRegistrationTokens.get(TENANT, body.id);
    expect(stored!.sub).toBe("email|userId");
    expect(stored!.constraints).toEqual({ client_name: "Pinned App" });
    expect(stored!.single_use).toBe(false);
  });

  it("rejects a TTL outside the accepted range", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const tooShort = await client["client-registration-tokens"].$post(
      {
        json: { expires_in_seconds: 5 },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(tooShort.status).toBe(400);

    const tooLong = await client["client-registration-tokens"].$post(
      {
        json: { expires_in_seconds: 60 * 60 * 24 + 1 },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(tooLong.status).toBe(400);
  });

  it("keeps a minted token inside the tenant that minted it", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.tenants.create({
      id: OTHER_TENANT,
      friendly_name: "Other Tenant",
      audience: "https://other.example.com",
      sender_email: "login@other.example.com",
      sender_name: "Other",
    });

    const response = await client["client-registration-tokens"].$post(
      {
        json: {},
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as MintResponse;

    expect(
      await env.data.clientRegistrationTokens.get(OTHER_TENANT, body.id),
    ).toBeNull();
    expect(
      await env.data.clientRegistrationTokens.get(TENANT, body.id),
    ).not.toBeNull();
  });

  it("audits the issuance in the tenant log", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await client["client-registration-tokens"].$post(
      {
        json: {},
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as MintResponse;

    const { logs } = await env.data.logs.list(TENANT, {
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    const issuance = logs.find((log) =>
      log.description?.includes("Initial Access Token"),
    );
    expect(issuance).toBeDefined();
    // The plaintext token must never reach the audit trail.
    expect(JSON.stringify(logs)).not.toContain(body.token);
  });
});
