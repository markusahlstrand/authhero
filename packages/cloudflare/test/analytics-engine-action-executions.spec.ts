import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createAnalyticsEngineActionExecutionsAdapter } from "../src/analytics-engine-action-executions";
import type { AnalyticsEngineDataset } from "../src/analytics-engine-logs";

const createMockBinding = (): AnalyticsEngineDataset & {
  dataPoints: Array<{
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }>;
} => {
  const dataPoints: Array<{
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }> = [];

  return {
    dataPoints,
    writeDataPoint: vi.fn((data) => {
      dataPoints.push(data);
    }),
  };
};

// Mirror of the AE blob layout for action_executions — keep in sync with
// packages/cloudflare/src/analytics-engine-action-executions/actionExecutions.ts.
//   blob1: id, blob2: trigger_id, blob3: status,
//   blob4: results (JSON), blob5: logs (JSON),
//   blob6: created_at, blob7: updated_at
//   double1: created_at_ts
//   index1: tenant_id
const mockExecutionRow = {
  blob1: "exec-123",
  blob2: "post-login",
  blob3: "final",
  blob4: JSON.stringify([
    {
      action_name: "addRole",
      error: null,
      started_at: "2024-01-15T10:00:00.000Z",
      ended_at: "2024-01-15T10:00:00.100Z",
    },
  ]),
  blob5: JSON.stringify([
    {
      action_name: "addRole",
      lines: [{ level: "log", message: "added role admin" }],
    },
  ]),
  blob6: "2024-01-15T10:00:00.000Z",
  blob7: "2024-01-15T10:00:00.000Z",
  double1: 1705312800000,
  index1: "tenant-1",
};

const server = setupServer(
  http.post(
    "https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/sql",
    async () => {
      return HttpResponse.json({ success: true, data: [mockExecutionRow] });
    },
  ),
);

describe("Analytics Engine ActionExecutions Adapter", () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  beforeEach(() => server.resetHandlers());

  describe("create", () => {
    it("writes an execution row with the documented blob layout", async () => {
      const mockBinding = createMockBinding();
      const adapter = createAnalyticsEngineActionExecutionsAdapter({
        analyticsEngineBinding: mockBinding,
        accountId: "test-account",
        apiToken: "test-token",
      });

      const execution = await adapter.create("tenant-1", {
        id: "exec-123",
        trigger_id: "post-login",
        status: "final",
        results: [
          {
            action_name: "addRole",
            error: null,
            started_at: "2024-01-15T10:00:00.000Z",
            ended_at: "2024-01-15T10:00:00.100Z",
          },
        ],
        logs: [
          {
            action_name: "addRole",
            lines: [{ level: "log", message: "added role admin" }],
          },
        ],
      });

      expect(execution.id).toBe("exec-123");
      expect(execution.tenant_id).toBe("tenant-1");
      expect(execution.status).toBe("final");

      expect(mockBinding.writeDataPoint).toHaveBeenCalledTimes(1);
      const dp = mockBinding.dataPoints[0]!;
      expect(dp.indexes).toEqual(["tenant-1"]);
      expect(dp.blobs?.[0]).toBe("exec-123");
      expect(dp.blobs?.[1]).toBe("post-login");
      expect(dp.blobs?.[2]).toBe("final");
      expect(JSON.parse(dp.blobs?.[3] || "[]")).toHaveLength(1);
      expect(JSON.parse(dp.blobs?.[4] || "[]")[0].lines).toHaveLength(1);
      expect(typeof dp.doubles?.[0]).toBe("number");
    });

    it("omits logs from blob5 when none provided", async () => {
      const mockBinding = createMockBinding();
      const adapter = createAnalyticsEngineActionExecutionsAdapter({
        analyticsEngineBinding: mockBinding,
        accountId: "test-account",
        apiToken: "test-token",
      });

      await adapter.create("tenant-1", {
        id: "exec-no-logs",
        trigger_id: "post-login",
        status: "final",
        results: [],
      });

      // stringify(undefined) → "" by design
      expect(mockBinding.dataPoints[0]?.blobs?.[4]).toBe("");
    });

    it("truncates oversized logs blobs with a sentinel", async () => {
      const mockBinding = createMockBinding();
      const adapter = createAnalyticsEngineActionExecutionsAdapter({
        analyticsEngineBinding: mockBinding,
        accountId: "test-account",
        apiToken: "test-token",
      });

      const longLine = "x".repeat(2048);

      await adapter.create("tenant-1", {
        id: "exec-big",
        trigger_id: "post-login",
        status: "final",
        results: [],
        logs: [
          {
            action_name: "noisy",
            lines: [{ level: "log", message: longLine }],
          },
        ],
      });

      const blob5 = mockBinding.dataPoints[0]?.blobs?.[4] ?? "";
      expect(blob5.length).toBeLessThanOrEqual(1024);
      expect(blob5.endsWith("[truncated]")).toBe(true);
    });
  });

  describe("get", () => {
    it("reads an execution back through the SQL API", async () => {
      const adapter = createAnalyticsEngineActionExecutionsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
        dataset: "authhero_action_executions",
      });

      const execution = await adapter.get("tenant-1", "exec-123");
      expect(execution).not.toBeNull();
      expect(execution?.id).toBe("exec-123");
      expect(execution?.tenant_id).toBe("tenant-1");
      expect(execution?.trigger_id).toBe("post-login");
      expect(execution?.status).toBe("final");
      expect(execution?.results).toHaveLength(1);
      expect(execution?.logs?.[0]?.lines?.[0]?.message).toBe(
        "added role admin",
      );
    });

    it("returns null when no row matches", async () => {
      server.use(
        http.post(
          "https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/sql",
          async () => HttpResponse.json({ success: true, data: [] }),
        ),
      );

      const adapter = createAnalyticsEngineActionExecutionsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
      });

      const execution = await adapter.get("tenant-1", "missing");
      expect(execution).toBeNull();
    });

    it("scopes the query to the tenant via index1 and id via blob1", async () => {
      const captured: string[] = [];
      server.use(
        http.post(
          "https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/sql",
          async ({ request }) => {
            captured.push(await request.text());
            return HttpResponse.json({ success: true, data: [] });
          },
        ),
      );

      const adapter = createAnalyticsEngineActionExecutionsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
        dataset: "custom_ae_dataset",
      });

      await adapter.get("tenant-1", "exec-123");
      const sql = captured[0]!;
      expect(sql).toContain(`"custom_ae_dataset"`);
      expect(sql).toContain(`index1 = 'tenant-1'`);
      expect(sql).toContain(`blob1 = 'exec-123'`);
    });

    it("falls back to 'unspecified' when status is unrecognised", async () => {
      server.use(
        http.post(
          "https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/sql",
          async () =>
            HttpResponse.json({
              success: true,
              data: [{ ...mockExecutionRow, blob3: "garbage" }],
            }),
        ),
      );

      const adapter = createAnalyticsEngineActionExecutionsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
      });

      const execution = await adapter.get("tenant-1", "exec-123");
      expect(execution?.status).toBe("unspecified");
    });
  });
});
