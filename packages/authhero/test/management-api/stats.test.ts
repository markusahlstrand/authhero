import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { LogTypes } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

function seedLog(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  type: string,
  date: string,
  user_id?: string,
) {
  return env.data.logs.create("tenantId", {
    type,
    date,
    description: `seeded ${type}`,
    isMobile: false,
    ...(user_id ? { user_id } : {}),
  });
}

describe("GET /stats/daily", () => {
  it("aggregates only SUCCESS_LOGIN as logins, SUCCESS_SIGNUP as signups, pwd_leak as leaked_passwords", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Two real logins on the same day
    await seedLog(
      env,
      LogTypes.SUCCESS_LOGIN,
      "2026-05-10T08:00:00.000Z",
      "u1",
    );
    await seedLog(
      env,
      LogTypes.SUCCESS_LOGIN,
      "2026-05-10T09:00:00.000Z",
      "u2",
    );
    // A token exchange and a silent auth on the same day — these must NOT
    // count as logins (Auth0 parity).
    await seedLog(
      env,
      LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
      "2026-05-10T10:00:00.000Z",
      "u1",
    );
    await seedLog(env, "ssa", "2026-05-10T11:00:00.000Z", "u1");

    // One signup on a different day
    await seedLog(env, LogTypes.SUCCESS_SIGNUP, "2026-05-11T08:00:00.000Z");

    // A breached-password detection plus a non-Auth0 variant that must NOT count
    await seedLog(env, LogTypes.BREACHED_PASSWORD, "2026-05-12T08:00:00.000Z");
    await seedLog(
      env,
      LogTypes.BREACHED_PASSWORD_ON_SIGNUP,
      "2026-05-12T08:30:00.000Z",
    );

    const res = await client.stats.daily.$get(
      {
        query: { from: "20260510", to: "20260512" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      date: string;
      logins: number;
      signups: number;
      leaked_passwords: number;
    }>;

    expect(body.map((r) => r.date)).toEqual([
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
    ]);
    expect(body[0]).toMatchObject({
      logins: 2,
      signups: 0,
      leaked_passwords: 0,
    });
    expect(body[1]).toMatchObject({
      logins: 0,
      signups: 1,
      leaked_passwords: 0,
    });
    expect(body[2]).toMatchObject({
      logins: 0,
      signups: 0,
      leaked_passwords: 1,
    });
  });

  it("zero-fills days that have no logs across the requested range", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Only one event on the middle day of a 5-day range
    await seedLog(
      env,
      LogTypes.SUCCESS_LOGIN,
      "2026-05-03T12:00:00.000Z",
      "u1",
    );

    const res = await client.stats.daily.$get(
      {
        query: { from: "20260501", to: "20260505" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      date: string;
      logins: number;
      signups: number;
      leaked_passwords: number;
    }>;

    expect(body.map((r) => r.date)).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
    ]);
    expect(body[0]).toMatchObject({
      logins: 0,
      signups: 0,
      leaked_passwords: 0,
    });
    expect(body[2]).toMatchObject({
      logins: 1,
      signups: 0,
      leaked_passwords: 0,
    });
    expect(body[4]).toMatchObject({
      logins: 0,
      signups: 0,
      leaked_passwords: 0,
    });
  });
});

describe("GET /stats/active-users", () => {
  it("counts distinct users with a SUCCESS_LOGIN in the last 30 days", async () => {
    const { managementApp, env } = await getTestServer();
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

    // Two distinct users with recent logins
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, "user-a");
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, "user-b");
    // Same user again — must not double-count
    await seedLog(env, LogTypes.SUCCESS_LOGIN, recent, "user-a");
    // A token exchange must NOT make user-c "active"
    await seedLog(
      env,
      LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
      recent,
      "user-c",
    );
    // An old login outside the 30-day window
    await seedLog(env, LogTypes.SUCCESS_LOGIN, old, "user-d");

    const res = await client.stats["active-users"].$get(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as number;
    expect(body).toBe(2);
  });
});
