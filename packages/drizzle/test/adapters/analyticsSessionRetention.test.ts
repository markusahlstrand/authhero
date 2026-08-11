import { describe, it, expect, vi, afterEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function device() {
  return {
    last_ip: "",
    initial_ip: "",
    last_user_agent: "",
    initial_user_agent: "",
    initial_asn: "",
    last_asn: "",
  };
}

describe("analytics sessionRetention", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("folds created/used weeks into per-cohort retention", async () => {
    const { data } = getTestServer();
    await data.tenants.create({ id: "tenantId", name: "Test Tenant" });
    await data.tenants.create({ id: "otherTenant", name: "Other Tenant" });

    const retention = data.analytics?.sessionRetention;
    if (!retention) {
      throw new Error("drizzle analytics adapter must expose sessionRetention");
    }

    // created_at_ts is pinned to Date.now() in the adapter, so build
    // historical cohorts with fake timers. Offsets are exact multiples of a
    // week, which keeps every session in the same relative bucket no matter
    // where "now" falls within its week.
    const realNow = Date.now();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(realNow - 2 * WEEK_MS);
      for (const id of ["s1", "s2", "s3"]) {
        await data.sessions.create("tenantId", {
          id,
          user_id: "u1",
          login_session_id: "ls1",
          device: device(),
          clients: ["clientId"],
        });
      }
      // Sessions from another tenant must not leak into the cohorts.
      await data.sessions.create("otherTenant", {
        id: "sx",
        user_id: "u1",
        login_session_id: "ls2",
        device: device(),
        clients: ["clientId"],
      });

      vi.setSystemTime(realNow);
      await data.sessions.create("tenantId", {
        id: "s4",
        user_id: "u1",
        login_session_id: "ls3",
        device: device(),
        clients: ["clientId"],
      });
    } finally {
      vi.useRealTimers();
    }

    // s1 was last used one week after creation, s2 this week, s3 never.
    await data.sessions.update("tenantId", "s1", {
      used_at: new Date(realNow - WEEK_MS).toISOString(),
    });
    await data.sessions.update("tenantId", "s2", {
      used_at: new Date(realNow).toISOString(),
    });

    const result = await retention("tenantId", { weeks: 4 });

    expect(result.interval).toBe("week");
    expect(result.cohorts).toHaveLength(4);

    const twoWeeksBack = result.cohorts[1]!;
    expect(twoWeeksBack.sessions).toBe(3);
    expect(twoWeeksBack.active).toEqual([3, 2, 1]);

    const currentWeek = result.cohorts[3]!;
    expect(currentWeek.sessions).toBe(1);
    expect(currentWeek.active).toEqual([1]);

    const emptyCohort = result.cohorts[0]!;
    expect(emptyCohort.sessions).toBe(0);
    expect(emptyCohort.active).toEqual([0, 0, 0, 0]);
  });
});
