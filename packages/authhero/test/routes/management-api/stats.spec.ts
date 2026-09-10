import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

const TENANT = "tenantId";
const OTHER_TENANT = "otherTenant";

type DailyStatsRow = {
  date: string;
  logins: number;
  signups: number;
  leaked_passwords: number;
};

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

describe("management-api stats", () => {
  it("returns one daily row per day in the range, zero-filling empty days", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Two logins and a signup on the first day, nothing on the second, a
    // leaked-password detection on the third.
    await env.data.logs.create(TENANT, {
      log_id: "log-1",
      type: "s",
      date: "2026-01-01T09:00:00.000Z",
      user_id: "email|userId",
      isMobile: false,
    });
    await env.data.logs.create(TENANT, {
      log_id: "log-2",
      type: "s",
      date: "2026-01-01T10:00:00.000Z",
      user_id: "email|other",
      isMobile: false,
    });
    await env.data.logs.create(TENANT, {
      log_id: "log-3",
      type: "ss",
      date: "2026-01-01T11:00:00.000Z",
      user_id: "email|userId",
      isMobile: false,
    });
    await env.data.logs.create(TENANT, {
      log_id: "log-4",
      type: "pwd_leak",
      date: "2026-01-03T09:00:00.000Z",
      user_id: "email|userId",
      isMobile: false,
    });

    const response = await client.stats.daily.$get(
      {
        query: { from: "20260101", to: "20260103" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as DailyStatsRow[];
    expect(body.map((row) => row.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(body[0]).toMatchObject({
      logins: 2,
      signups: 1,
      leaked_passwords: 0,
    });
    // A day with no logs still gets a row — Auth0 returns a dense range.
    expect(body[1]).toMatchObject({
      logins: 0,
      signups: 0,
      leaked_passwords: 0,
    });
    expect(body[2]).toMatchObject({
      logins: 0,
      signups: 0,
      leaked_passwords: 1,
    });
  });

  it("counts only the requesting tenant's logs", async () => {
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

    await env.data.logs.create(TENANT, {
      log_id: "log-own",
      type: "s",
      date: "2026-02-01T09:00:00.000Z",
      user_id: "email|userId",
      isMobile: false,
    });
    await env.data.logs.create(OTHER_TENANT, {
      log_id: "log-foreign",
      type: "s",
      date: "2026-02-01T09:00:00.000Z",
      user_id: "email|foreign",
      isMobile: false,
    });

    const response = await client.stats.daily.$get(
      {
        query: { from: "20260201", to: "20260201" },
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as DailyStatsRow[];
    expect(body).toHaveLength(1);
    expect(body[0]!.logins).toBe(1);
  });

  it("defaults to the trailing 30 days when no range is given", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.logs.create(TENANT, {
      log_id: "log-recent",
      type: "s",
      date: isoDaysAgo(1),
      user_id: "email|userId",
      isMobile: false,
    });

    const response = await client.stats.daily.$get(
      {
        query: {},
        header: { "tenant-id": TENANT },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as DailyStatsRow[];
    // 30 days back through today, inclusive.
    expect(body).toHaveLength(31);
    expect(body.reduce((sum, row) => sum + row.logins, 0)).toBe(1);
  });

  it("counts distinct users with a login in the last 30 days as active", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Same user twice — one active user, not two.
    await env.data.logs.create(TENANT, {
      log_id: "active-1",
      type: "s",
      date: isoDaysAgo(1),
      user_id: "email|userId",
      isMobile: false,
    });
    await env.data.logs.create(TENANT, {
      log_id: "active-2",
      type: "s",
      date: isoDaysAgo(2),
      user_id: "email|userId",
      isMobile: false,
    });
    await env.data.logs.create(TENANT, {
      log_id: "active-3",
      type: "s",
      date: isoDaysAgo(3),
      user_id: "email|second",
      isMobile: false,
    });
    // Outside the window — must not count.
    await env.data.logs.create(TENANT, {
      log_id: "stale",
      type: "s",
      date: isoDaysAgo(45),
      user_id: "email|stale",
      isMobile: false,
    });

    const response = await client.stats["active-users"].$get(
      { header: { "tenant-id": TENANT } },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toBe(2);
  });

  it("requires a read:stats scope", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const tokenWithoutScope = await getAdminToken({ permissions: [] });

    const response = await client.stats.daily.$get(
      { query: {}, header: { "tenant-id": TENANT } },
      { headers: { authorization: `Bearer ${tokenWithoutScope}` } },
    );

    expect(response.status).toBe(403);
  });
});
