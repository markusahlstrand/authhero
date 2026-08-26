import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createAnalyticsEngineStatsAdapter } from "../src/analytics-engine-logs";
import createAdapters from "../src/index";

const SQL_ENDPOINT =
  "https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/sql";

// Queries the adapter sent, in order. Assertions read the SQL text directly:
// the whole point of these tests is that the interpolated bounds are real
// epoch milliseconds and not `NaN`.
let queries: string[] = [];
let rows: Record<string, unknown>[] = [];

const server = setupServer(
  http.post(SQL_ENDPOINT, async ({ request }) => {
    queries.push(await request.text());
    return HttpResponse.json({ success: true, data: rows });
  }),
);

function createAdapter() {
  return createAnalyticsEngineStatsAdapter({
    accountId: "test-account",
    apiToken: "test-token",
    dataset: "auth_logs",
  });
}

/** Pull the `double2 >= X` / `double2 <= Y` bounds out of the generated SQL. */
function timestampBounds(query: string): { from?: string; to?: string } {
  return {
    from: query.match(/double2 >= (\S+)/)?.[1],
    to: query.match(/double2 <= (\S+)/)?.[1],
  };
}

describe("Analytics Engine Stats Adapter", () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => {
    queries = [];
    rows = [];
  });

  describe("getDaily", () => {
    // The management API normalizes `from`/`to` to YYYY-MM-DD before calling
    // the adapter. Re-slicing those as YYYYMMDD produced "2026--0-7-", so both
    // bounds became NaN and every query returned nothing — the dashboard
    // rendered 30 days of zeros.
    it("accepts already-normalized YYYY-MM-DD dates", async () => {
      await createAdapter().getDaily("tenant-1", {
        from: "2026-07-27",
        to: "2026-08-26",
      });

      const bounds = timestampBounds(queries[0]!);
      expect(bounds.from).toBe(String(Date.UTC(2026, 6, 27, 0, 0, 0, 0)));
      expect(bounds.to).toBe(String(Date.UTC(2026, 7, 26, 23, 59, 59, 999)));
      expect(queries[0]).not.toContain("NaN");
    });

    it("still accepts the Auth0-style YYYYMMDD dates", async () => {
      await createAdapter().getDaily("tenant-1", {
        from: "20260727",
        to: "20260826",
      });

      const bounds = timestampBounds(queries[0]!);
      expect(bounds.from).toBe(String(Date.UTC(2026, 6, 27, 0, 0, 0, 0)));
      expect(bounds.to).toBe(String(Date.UTC(2026, 7, 26, 23, 59, 59, 999)));
    });

    it("defaults to the last 30 days with real bounds", async () => {
      await createAdapter().getDaily("tenant-1");

      const bounds = timestampBounds(queries[0]!);
      expect(Number(bounds.from)).not.toBeNaN();
      expect(Number(bounds.to)).not.toBeNaN();
      expect(Number(bounds.to)).toBeGreaterThan(Number(bounds.from));
    });

    it("throws rather than querying with NaN bounds", async () => {
      await expect(
        createAdapter().getDaily("tenant-1", { from: "not-a-date" }),
      ).rejects.toThrow(/Invalid stats date range/);
      expect(queries).toHaveLength(0);
    });

    it("scopes the query to the tenant and the configured dataset", async () => {
      await createAdapter().getDaily("tenant-1", {
        from: "2026-07-27",
        to: "2026-08-26",
      });

      expect(queries[0]).toContain(`FROM "auth_logs"`);
      expect(queries[0]).toContain(`index1 = 'tenant-1'`);
    });

    it("maps aggregated rows to DailyStats", async () => {
      rows = [
        {
          date: "2026-08-25",
          logins: "12",
          signups: "3",
          leaked_passwords: "1",
          first_event: 1787616000000,
          last_event: 1787702399000,
        },
      ];

      const stats = await createAdapter().getDaily("tenant-1", {
        from: "2026-08-25",
        to: "2026-08-25",
      });

      expect(stats).toEqual([
        {
          date: "2026-08-25",
          logins: 12,
          signups: 3,
          leaked_passwords: 1,
          created_at: new Date(1787616000000).toISOString(),
          updated_at: new Date(1787702399000).toISOString(),
        },
      ]);
    });

    it("counts only SUCCESS_LOGIN as logins and pwd_leak as leaked passwords", async () => {
      await createAdapter().getDaily("tenant-1", {
        from: "2026-08-25",
        to: "2026-08-25",
      });

      // Auth0 parity: token exchanges ('seacft') and silent auth ('ssa') must
      // not inflate the login count.
      expect(queries[0]).toContain(
        "SUM(CASE WHEN blob3 IN ('s') THEN 1 ELSE 0 END) AS logins",
      );
      expect(queries[0]).toContain(
        "SUM(CASE WHEN blob3 = 'ss' THEN 1 ELSE 0 END) AS signups",
      );
      expect(queries[0]).toContain(
        "SUM(CASE WHEN blob3 IN ('pwd_leak') THEN 1 ELSE 0 END) AS leaked_passwords",
      );
    });
  });

  describe("getActiveUsers", () => {
    it("counts distinct logged-in users over the last 30 days", async () => {
      rows = [{ count: 42 }];

      const count = await createAdapter().getActiveUsers("tenant-1");

      expect(count).toBe(42);
      expect(queries[0]).toContain("COUNT(DISTINCT blob7) AS count");
      expect(queries[0]).toContain(`index1 = 'tenant-1'`);
      expect(queries[0]).toContain("blob3 IN ('s')");
      expect(timestampBounds(queries[0]!).from).not.toBe("NaN");
    });

    it("returns 0 when the dataset has no matching rows", async () => {
      rows = [];
      expect(await createAdapter().getActiveUsers("tenant-1")).toBe(0);
    });
  });

  describe("createAdapters wiring", () => {
    // Without this, consumers that move logs to Analytics Engine keep the SQL
    // adapter's stats, which reads a logs table nothing writes to any more.
    it("exposes a stats adapter when Analytics Engine logs are configured", async () => {
      const adapters = createAdapters({
        zoneId: "zone",
        authKey: "key",
        authEmail: "email@example.com",
        analyticsEngineLogs: {
          accountId: "test-account",
          apiToken: "test-token",
          dataset: "auth_logs",
        },
      });

      expect(adapters.stats).toBeDefined();

      await adapters.stats!.getDaily("tenant-1", {
        from: "2026-07-27",
        to: "2026-08-26",
      });
      expect(queries[0]).toContain(`FROM "auth_logs"`);
      expect(queries[0]).not.toContain("NaN");
    });

    it("leaves stats undefined when Analytics Engine is not configured", () => {
      const adapters = createAdapters({
        zoneId: "zone",
        authKey: "key",
        authEmail: "email@example.com",
      });

      expect(adapters.stats).toBeUndefined();
    });
  });
});
