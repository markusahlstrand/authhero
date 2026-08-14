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

function token(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    login_id: "ls1",
    user_id: "u1",
    client_id: "clientA",
    device: device(),
    resource_servers: [],
    rotating: false,
    ...overrides,
  };
}

describe("analytics refreshTokenRetention", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("folds rotation families into per-cohort retention", async () => {
    const { data } = getTestServer();
    await data.tenants.create({ id: "tenantId", name: "Test Tenant" });
    await data.tenants.create({ id: "otherTenant", name: "Other Tenant" });

    const retention = data.analytics?.refreshTokenRetention;
    if (!retention) {
      throw new Error(
        "drizzle analytics adapter must expose refreshTokenRetention",
      );
    }

    // created_at_ts is pinned to Date.now() in the adapter, so build
    // historical cohorts with fake timers. Offsets are exact multiples of a
    // week, which keeps every token in the same relative bucket no matter
    // where "now" falls within its week.
    const realNow = Date.now();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(realNow - 2 * WEEK_MS);
      // Rotating family: root two weeks back, still exchanging (children
      // below). Must count once, in the root's cohort.
      await data.refreshTokens.create(
        "tenantId",
        token("rt1", { rotating: true, family_id: "rt1" }),
      );
      // Non-rotating token exchanged one week later (last_exchanged_at set
      // in-place, no new row).
      await data.refreshTokens.create("tenantId", token("rt2"));
      // Never exchanged again.
      await data.refreshTokens.create("tenantId", token("rt3"));
      // Another tenant's token must not leak into the cohorts.
      await data.refreshTokens.create("otherTenant", token("rtx"));

      vi.setSystemTime(realNow - WEEK_MS);
      // rt1 rotated: child row created one week back, same family.
      await data.refreshTokens.create(
        "tenantId",
        token("rt1c1", { rotating: true, family_id: "rt1" }),
      );

      vi.setSystemTime(realNow);
      // Second rotation this week — family rt1 is active through week +2.
      await data.refreshTokens.create(
        "tenantId",
        token("rt1c2", { rotating: true, family_id: "rt1" }),
      );
      // Fresh token this week on a different client.
      await data.refreshTokens.create(
        "tenantId",
        token("rt4", { client_id: "clientB" }),
      );
    } finally {
      vi.useRealTimers();
    }

    await data.refreshTokens.update("tenantId", "rt2", {
      last_exchanged_at: new Date(realNow - WEEK_MS).toISOString(),
    });

    const result = await retention("tenantId", { weeks: 4 });

    expect(result.interval).toBe("week");
    expect(result.cohorts).toHaveLength(4);

    // Cohorts are oldest-first: index 1 is the week two weeks back.
    const twoWeeksBack = result.cohorts[1]!;
    // rt1 (family), rt2, rt3 — the rotation children collapse into rt1.
    expect(twoWeeksBack.tokens).toBe(3);
    // +0w: all three; +1w: rt1 (rotated later) and rt2 (exchanged then);
    // +2w: only rt1 (rotated again this week).
    expect(twoWeeksBack.active).toEqual([3, 2, 1]);

    const currentWeek = result.cohorts[3]!;
    expect(currentWeek.tokens).toBe(1);
    expect(currentWeek.active).toEqual([1]);

    const emptyCohort = result.cohorts[0]!;
    expect(emptyCohort.tokens).toBe(0);
    expect(emptyCohort.active).toEqual([0, 0, 0, 0]);
  });

  it("filters by client_id", async () => {
    const { data } = getTestServer();
    await data.tenants.create({ id: "tenantId", name: "Test Tenant" });

    const retention = data.analytics?.refreshTokenRetention;
    if (!retention) {
      throw new Error(
        "drizzle analytics adapter must expose refreshTokenRetention",
      );
    }

    await data.refreshTokens.create("tenantId", token("a1"));
    await data.refreshTokens.create(
      "tenantId",
      token("b1", { client_id: "clientB" }),
    );
    await data.refreshTokens.create(
      "tenantId",
      token("b2", { client_id: "clientB" }),
    );

    const all = await retention("tenantId", { weeks: 2 });
    expect(all.cohorts[1]!.tokens).toBe(3);

    const onlyB = await retention("tenantId", {
      weeks: 2,
      client_id: ["clientB"],
    });
    expect(onlyB.cohorts[1]!.tokens).toBe(2);

    const none = await retention("tenantId", {
      weeks: 2,
      client_id: ["missing"],
    });
    expect(none.cohorts[1]!.tokens).toBe(0);
  });
});
