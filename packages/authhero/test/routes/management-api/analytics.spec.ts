import { describe, it, expect } from "vitest";
import {
  AnalyticsAdapter,
  AnalyticsQueryParams,
  AnalyticsResource,
} from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

const TENANT = "tenantId";
const OTHER_TENANT = "otherTenant";

const RESOURCES: AnalyticsResource[] = [
  "active-users",
  "logins",
  "signups",
  "refresh-tokens",
  "sessions",
  "logouts",
  "password-changes",
  "password-migrations",
  "mfa",
  "email-verifications",
  "codes-sent",
];

type QueryCall = {
  tenantId: string;
  resource: AnalyticsResource;
  params: AnalyticsQueryParams;
};

type RetentionCall = {
  kind: "session" | "refresh";
  tenantId: string;
  params: unknown;
};

/**
 * In-memory analytics adapter. Each tenant has its own row count and only the
 * count of the tenant passed in by the route is returned, which is the
 * contract the real adapters implement.
 */
function createFakeAnalytics(countByTenant: Record<string, number>) {
  const calls: QueryCall[] = [];
  const retentionCalls: RetentionCall[] = [];

  const adapter: AnalyticsAdapter = {
    async query(tenantId, resource, params) {
      calls.push({ tenantId, resource, params });
      return {
        meta: [
          { name: "time", type: "DateTime" },
          { name: resource, type: "UInt64" },
        ],
        data: [
          {
            time: "2026-01-01T00:00:00.000Z",
            [resource]: countByTenant[tenantId] ?? 0,
          },
        ],
        rows: 1,
      };
    },
    async sessionRetention(tenantId, params) {
      retentionCalls.push({ kind: "session", tenantId, params });
      const count = countByTenant[tenantId] ?? 0;
      return {
        interval: "week",
        from: "2026-01-05T00:00:00.000Z",
        to: "2026-01-12T00:00:00.000Z",
        cohorts: [{ cohort: "2026-01-05", sessions: count, active: [count] }],
      } as Awaited<
        ReturnType<NonNullable<AnalyticsAdapter["sessionRetention"]>>
      >;
    },
    async refreshTokenRetention(tenantId, params) {
      retentionCalls.push({ kind: "refresh", tenantId, params });
      const count = countByTenant[tenantId] ?? 0;
      return {
        interval: "week",
        from: "2026-01-05T00:00:00.000Z",
        to: "2026-01-12T00:00:00.000Z",
        cohorts: [{ cohort: "2026-01-05", tokens: count, active: [count] }],
      };
    },
  };

  return { adapter, calls, retentionCalls };
}

// The management app rethrows 5xx HTTPExceptions to the parent app's error
// handler, so on the bare management app a 501 surfaces as a rejection.
async function expectNotImplemented(
  response: Promise<Response>,
  message: string,
) {
  await expect(response).rejects.toMatchObject({ status: 501, message });
}

const NO_ADAPTER = "Analytics adapter not configured";
const NO_SESSION_RETENTION =
  "Session retention is not supported by the configured analytics adapter";
const NO_TOKEN_RETENTION =
  "Refresh token retention is not supported by the configured analytics adapter";

describe("management-api analytics", () => {
  async function setup(
    adapterOverride?: (a: AnalyticsAdapter) => AnalyticsAdapter | undefined,
  ) {
    const { managementApp, env } = await getTestServer();
    const fake = createFakeAnalytics({ [TENANT]: 3, [OTHER_TENANT]: 99 });
    env.data.analytics = adapterOverride
      ? adapterOverride(fake.adapter)
      : fake.adapter;

    const request = async (
      path: string,
      init: { tenant?: string; token?: string } = {},
    ) => {
      const token = init.token ?? (await getAdminToken());
      return managementApp.request(
        `/analytics${path}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            "tenant-id": init.tenant ?? TENANT,
          },
        },
        env,
      );
    };
    return { env, request, managementApp, ...fake };
  }

  describe("GET /analytics/{resource}", () => {
    it.each(RESOURCES)(
      "returns the adapter result for %s",
      async (resource) => {
        const { request, calls } = await setup();

        const res = await request(`/${resource}`);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({
          meta: [
            { name: "time", type: "DateTime" },
            { name: resource, type: "UInt64" },
          ],
          data: [{ time: "2026-01-01T00:00:00.000Z", [resource]: 3 }],
          rows: 1,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ tenantId: TENANT, resource });
      },
    );

    it("applies defaults: 30 day window, day interval, UTC, limit 1000", async () => {
      const { request, calls } = await setup();

      const res = await request("/logins");

      expect(res.status).toBe(200);
      const params = calls[0].params;
      expect(params).toMatchObject({
        interval: "day",
        tz: "UTC",
        group_by: [],
        limit: 1000,
        offset: 0,
        filters: { connection: [], client_id: [], user_type: [], user_id: [] },
      });
      const span = Date.parse(params.to) - Date.parse(params.from);
      expect(span).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it("passes parsed query parameters through to the adapter", async () => {
      const { request, calls } = await setup();

      const query = new URLSearchParams();
      query.set("from", "2026-01-01T00:00:00Z");
      query.set("to", "2026-01-08T00:00:00Z");
      query.set("interval", "hour");
      query.set("tz", "Europe/Madrid");
      query.set("group_by", "time, connection");
      query.append("connection", "auth0");
      query.append("connection", "google");
      query.append("client_id", "client-1");
      query.append("user_type", "social");
      query.append("user_id", "email|abc");
      query.set("limit", "50");
      query.set("offset", "10");
      query.set("order_by", "-logins");

      const res = await request(`/logins?${query.toString()}`);

      expect(res.status).toBe(200);
      expect(calls[0].params).toEqual({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-08T00:00:00.000Z",
        interval: "hour",
        tz: "Europe/Madrid",
        group_by: ["time", "connection"],
        filters: {
          connection: ["auth0", "google"],
          client_id: ["client-1"],
          user_type: ["social"],
          user_id: ["email|abc"],
        },
        limit: 50,
        offset: 10,
        order_by: "-logins",
      });
    });
  });

  describe("query validation", () => {
    const expectInvalid = async (
      res: Response,
      param: string,
      detailPart?: string,
    ) => {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { detail: string };
      expect(body).toMatchObject({
        type: "https://authhero.net/errors/invalid-parameter",
        title: "Invalid parameter",
        status: 400,
        param,
      });
      if (detailPart) expect(body.detail).toContain(detailPart);
    };

    it("rejects a non-datetime from", async () => {
      const { request, calls } = await setup();
      const res = await request("/logins?from=not-a-date");
      expect(res.status).toBe(400);
      expect(calls).toHaveLength(0);
    });

    it("rejects to <= from", async () => {
      const { request, calls } = await setup();
      const res = await request(
        "/logins?from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z",
      );
      await expectInvalid(res, "to", "after");
      expect(calls).toHaveLength(0);
    });

    it("rejects an unknown interval", async () => {
      const { request } = await setup();
      const res = await request("/logins?interval=year");
      expect(res.status).toBe(400);
    });

    it("rejects interval=hour over more than 30 days", async () => {
      const { request } = await setup();
      const res = await request(
        "/logins?interval=hour&from=2026-01-01T00:00:00Z&to=2026-03-01T00:00:00Z",
      );
      await expectInvalid(res, "interval", "30 days");
    });

    it("allows interval=hour for exactly 30 days", async () => {
      const { request } = await setup();
      const res = await request(
        "/logins?interval=hour&from=2026-01-01T00:00:00Z&to=2026-01-31T00:00:00Z",
      );
      expect(res.status).toBe(200);
    });

    it("rejects a group_by dimension that is not valid for the resource", async () => {
      const { request } = await setup();
      // sessions only supports time and client_id
      const res = await request("/sessions?group_by=connection");
      await expectInvalid(res, "group_by", "/analytics/sessions");
    });

    it("rejects an unknown user_type", async () => {
      const { request } = await setup();
      const res = await request("/logins?user_type=robot");
      expect(res.status).toBe(400);
    });

    it("rejects non-integer and out of range limit and offset", async () => {
      const { request } = await setup();
      await expectInvalid(await request("/logins?limit=abc"), "limit");
      await expectInvalid(await request("/logins?limit=0"), "limit");
      await expectInvalid(await request("/logins?limit=10001"), "limit");
      await expectInvalid(await request("/logins?offset=-1"), "offset");
      await expectInvalid(await request("/logins?offset=1.5"), "offset");
    });

    it("rejects an order_by column that is not selectable", async () => {
      const { request } = await setup();
      await expectInvalid(
        await request("/logins?order_by=connection"),
        "order_by",
      );
      // Grouped columns and the resource metric are allowed, - means desc.
      expect((await request("/logins?order_by=-logins")).status).toBe(200);
      expect(
        (await request("/logins?group_by=connection&order_by=connection"))
          .status,
      ).toBe(200);
    });

    it("returns 404 for an unknown resource", async () => {
      const { request } = await setup();
      const res = await request("/not-a-resource");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /analytics/session-retention", () => {
    it("returns the cohort matrix for the tenant with 12 weeks by default", async () => {
      const { request, retentionCalls } = await setup();

      const res = await request("/session-retention");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { cohorts: unknown[] };
      expect(body).toMatchObject({
        interval: "week",
        from: expect.any(String),
        to: expect.any(String),
      });
      expect(body.cohorts).toEqual([
        { cohort: "2026-01-05", sessions: 3, active: [3] },
      ]);
      expect(retentionCalls).toEqual([
        { kind: "session", tenantId: TENANT, params: { weeks: 12 } },
      ]);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("passes the weeks parameter through", async () => {
      const { request, retentionCalls } = await setup();
      const res = await request("/session-retention?weeks=26");
      expect(res.status).toBe(200);
      expect(retentionCalls[0].params).toEqual({ weeks: 26 });
    });

    it.each(["0", "27", "abc", "1.5"])("rejects weeks=%s", async (weeks) => {
      const { request, retentionCalls } = await setup();
      const res = await request(`/session-retention?weeks=${weeks}`);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { param: string }).param).toBe("weeks");
      expect(retentionCalls).toHaveLength(0);
    });

    it("returns 501 when the adapter has no sessionRetention", async () => {
      const { request } = await setup((a) => ({ query: a.query }));
      await expectNotImplemented(
        request("/session-retention"),
        NO_SESSION_RETENTION,
      );
    });
  });

  describe("GET /analytics/refresh-token-retention", () => {
    it("returns the cohort matrix for the tenant with 12 weeks by default", async () => {
      const { request, retentionCalls } = await setup();

      const res = await request("/refresh-token-retention");

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        interval: string;
        cohorts: unknown[];
      };
      expect(body.interval).toBe("week");
      expect(body.cohorts).toEqual([
        { cohort: "2026-01-05", tokens: 3, active: [3] },
      ]);
      expect(retentionCalls).toEqual([
        {
          kind: "refresh",
          tenantId: TENANT,
          params: { weeks: 12, client_id: undefined },
        },
      ]);
    });

    it("passes repeated client_id filters through", async () => {
      const { request, retentionCalls } = await setup();
      const res = await request(
        "/refresh-token-retention?weeks=4&client_id=a&client_id=b",
      );
      expect(res.status).toBe(200);
      expect(retentionCalls[0].params).toEqual({
        weeks: 4,
        client_id: ["a", "b"],
      });
    });

    it.each(["0", "27", "abc"])("rejects weeks=%s", async (weeks) => {
      const { request, retentionCalls } = await setup();
      const res = await request(`/refresh-token-retention?weeks=${weeks}`);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { param: string }).param).toBe("weeks");
      expect(retentionCalls).toHaveLength(0);
    });

    it("returns 501 when the adapter has no refreshTokenRetention", async () => {
      const { request } = await setup((a) => ({ query: a.query }));
      await expectNotImplemented(
        request("/refresh-token-retention"),
        NO_TOKEN_RETENTION,
      );
    });
  });

  describe("missing analytics adapter", () => {
    it("returns 501 for resource routes", async () => {
      const { request } = await setup(() => undefined);
      for (const resource of ["logins", "active-users"]) {
        await expectNotImplemented(request(`/${resource}`), NO_ADAPTER);
      }
    });

    it("returns 501 for both retention routes", async () => {
      const { request } = await setup(() => undefined);
      await expectNotImplemented(
        request("/session-retention"),
        NO_SESSION_RETENTION,
      );
      await expectNotImplemented(
        request("/refresh-token-retention"),
        NO_TOKEN_RETENTION,
      );
    });

    it("reports 501 before validating the query", async () => {
      const { request } = await setup(() => undefined);
      await expectNotImplemented(request("/logins?limit=abc"), NO_ADAPTER);
    });
  });

  describe("tenant isolation", () => {
    it("scopes every route to the tenant-id header", async () => {
      const { request, calls, retentionCalls } = await setup();

      const own = (await (await request("/logins")).json()) as {
        data: { logins: number }[];
      };
      const other = (await (
        await request("/logins", { tenant: OTHER_TENANT })
      ).json()) as { data: { logins: number }[] };
      expect(own.data[0].logins).toBe(3);
      expect(other.data[0].logins).toBe(99);

      const ownSessions = (await (
        await request("/session-retention")
      ).json()) as { cohorts: { sessions: number }[] };
      const ownTokens = (await (
        await request("/refresh-token-retention")
      ).json()) as { cohorts: { tokens: number }[] };
      expect(ownSessions.cohorts[0].sessions).toBe(3);
      expect(ownTokens.cohorts[0].tokens).toBe(3);

      expect(calls.map((c) => c.tenantId)).toEqual([TENANT, OTHER_TENANT]);
      expect(retentionCalls.map((c) => c.tenantId)).toEqual([TENANT, TENANT]);
    });

    it("ignores a tenant_id in the query string", async () => {
      const { request, calls } = await setup();
      const res = await request(`/logins?tenant_id=${OTHER_TENANT}`);
      expect(res.status).toBe(200);
      expect(calls[0].tenantId).toBe(TENANT);
      expect(
        ((await res.json()) as { data: { logins: number }[] }).data[0].logins,
      ).toBe(3);
    });

    it("does not serve one tenant's cached result to another", async () => {
      const { request, calls } = await setup();
      const path = "/logins?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z";

      const a1 = await request(path);
      const b1 = await request(path, { tenant: OTHER_TENANT });
      const a2 = await request(path);

      expect(a1.headers.get("x-cache")).toBe("MISS");
      expect(b1.headers.get("x-cache")).toBe("MISS");
      expect(
        ((await b1.json()) as { data: { logins: number }[] }).data[0].logins,
      ).toBe(99);
      expect(a2.headers.get("x-cache")).toBe("HIT");
      expect(
        ((await a2.json()) as { data: { logins: number }[] }).data[0].logins,
      ).toBe(3);
      // Only the two distinct tenants reached the adapter.
      expect(calls.map((c) => c.tenantId)).toEqual([TENANT, OTHER_TENANT]);
    });
  });

  describe("permissions", () => {
    it("requires a read:stats scope on every route", async () => {
      const { request, calls, retentionCalls } = await setup();
      const token = await getAdminToken({ permissions: [] });

      for (const path of [
        "/logins",
        "/active-users",
        "/session-retention",
        "/refresh-token-retention",
      ]) {
        const res = await request(path, { token });
        expect(res.status, path).toBe(403);
      }
      expect(calls).toHaveLength(0);
      expect(retentionCalls).toHaveLength(0);
    });

    it("rejects an unrelated scope", async () => {
      const { request } = await setup();
      const token = await getAdminToken({ permissions: ["read:users"] });
      expect((await request("/logins", { token })).status).toBe(403);
    });

    it("allows a token holding only read:stats", async () => {
      const { request } = await setup();
      const token = await getAdminToken({ permissions: ["read:stats"] });
      expect((await request("/logins", { token })).status).toBe(200);
    });

    it("rejects requests without a token", async () => {
      const { managementApp, env } = await setup();
      const res = await managementApp.request(
        "/analytics/logins",
        { headers: { "tenant-id": TENANT } },
        env,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("caching", () => {
    it("serves the second identical request from cache", async () => {
      const { request, calls } = await setup();
      const path = "/logins?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z";

      const first = await request(path);
      const second = await request(path);

      expect(first.headers.get("x-cache")).toBe("MISS");
      expect(second.headers.get("x-cache")).toBe("HIT");
      expect(await second.json()).toEqual(await first.json());
      expect(calls).toHaveLength(1);
    });
  });
});
