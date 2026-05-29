import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { LogTypes } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

interface SeedOpts {
  user_id?: string;
  connection?: string;
  client_id?: string;
  strategy_type?: string;
}

function seedLog(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  type: string,
  date: string,
  opts: SeedOpts = {},
) {
  return env.data.logs.create("tenantId", {
    type,
    date,
    description: `seeded ${type}`,
    isMobile: false,
    ...opts,
  });
}

describe("GET /analytics/active-users", () => {
  it("returns total active users in the wire-format envelope", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, { user_id: "u1" });
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, { user_id: "u2" });
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, { user_id: "u1" });

    const res = await client.analytics["active-users"].$get(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meta: Array<{ name: string; type: string }>;
      data: Array<Record<string, unknown>>;
      rows: number;
    };

    expect(body.meta.map((m) => m.name)).toContain("active_users");
    expect(body.data.length).toBe(1);
    expect(body.data[0]!.active_users).toBe(2);
  });

  it("groups by connection", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, {
      user_id: "u1",
      connection: "google-oauth2",
    });
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, {
      user_id: "u2",
      connection: "google-oauth2",
    });
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, {
      user_id: "u3",
      connection: "Username-Password",
    });

    const res = await client.analytics["active-users"].$get(
      {
        query: { group_by: "connection" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ connection: string; active_users: number }>;
    };

    expect(body.data).toHaveLength(2);
    const byConn = Object.fromEntries(
      body.data.map((r) => [r.connection, r.active_users]),
    );
    expect(byConn["google-oauth2"]).toBe(2);
    expect(byConn["Username-Password"]).toBe(1);
  });
});

describe("GET /analytics/logins", () => {
  it("counts all login events (success + failure types)", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const recent = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, { user_id: "u1" });
    await seedLog(env, "f", recent);
    await seedLog(env, "fp", recent);

    const res = await client.analytics.logins.$get(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ logins: number }>;
    };
    expect(body.data[0]!.logins).toBe(3);
  });

  it("filters by client_id (repeatable)", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const recent = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, {
      user_id: "u1",
      client_id: "abc",
    });
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, {
      user_id: "u2",
      client_id: "abc",
    });
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, {
      user_id: "u3",
      client_id: "def",
    });
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, {
      user_id: "u4",
      client_id: "xyz",
    });

    // Manually craft URL since the testClient generator only sees the
    // declared scalar param. The route reads repeated values via req.queries().
    const url = `/analytics/logins?client_id=abc&client_id=def`;
    const res = await managementApp.request(
      url,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ logins: number }> };
    expect(body.data[0]!.logins).toBe(3);
  });
});

describe("/analytics validation", () => {
  it("rejects invalid group_by for the resource with a problem+json body", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const res = await client.analytics["active-users"].$get(
      {
        query: { group_by: "event" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { param: string; detail: string };
    expect(body.param).toBe("group_by");
    expect(body.detail).toMatch(/not valid for \/analytics\/active-users/);
  });

  it("supports interval=week without adapter errors", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, { user_id: "u1" });

    const from = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();

    const res = await client.analytics.logins.$get(
      {
        query: { from, to, interval: "week", group_by: "time" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>;
      meta: Array<{ name: string }>;
    };
    expect(body.meta.map((m) => m.name)).toContain("time");
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("rejects unknown order_by columns", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const res = await client.analytics.logins.$get(
      {
        query: { group_by: "time", order_by: "1; DROP TABLE logs" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { param: string };
    expect(body.param).toBe("order_by");
  });

  it("rejects hourly intervals on ranges longer than 30 days", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();

    const res = await client.analytics.logins.$get(
      {
        query: { from, to, interval: "hour" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { param: string };
    expect(body.param).toBe("interval");
  });
});
