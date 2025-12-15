import { describe, expect, it, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  createAnalyticsEngineLogsAdapter,
  AnalyticsEngineDataset,
} from "../src/analytics-engine-logs";
import {
  createPassthroughAdapter,
  createWriteOnlyAdapter,
  LogsDataAdapter,
} from "@authhero/adapter-interfaces";

// Mock Analytics Engine dataset binding
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

// Mock SQL API responses
const mockLogs = [
  {
    blob1: "log-123",
    blob2: "tenant-1",
    blob3: "s",
    blob4: "2024-01-15T10:00:00.000Z",
    blob5: "User logged in",
    blob6: "192.168.1.1",
    blob7: "Mozilla/5.0",
    blob8: "user-456",
    blob9: "John Doe",
    blob10: "Username-Password-Authentication",
    blob11: "conn-789",
    blob12: "client-abc",
    blob13: "My App",
    blob14: "https://api.example.com",
    blob15: "openid profile",
    blob16: "auth0",
    blob17: "database",
    blob18: "login.example.com",
    blob19: "{}",
    blob20: '{"name":"auth0.js","version":"9.0.0"}',
    double1: 0,
    double2: 1705312800000,
    timestamp: "2024-01-15T10:00:00.000Z",
  },
];

const server = setupServer(
  // SQL API for queries
  http.post(
    "https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/sql",
    async ({ request }) => {
      const query = await request.text();

      // Check if it's a count query
      if (query.includes("count()")) {
        return HttpResponse.json({
          success: true,
          data: [{ count: mockLogs.length }],
        });
      }

      // Return mock logs for SELECT queries
      return HttpResponse.json({
        success: true,
        data: mockLogs,
      });
    },
  ),
);

describe("Analytics Engine Logs Adapter", () => {
  beforeAll(() => {
    server.listen();
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    server.resetHandlers();
  });

  describe("createLog", () => {
    it("should write a log to Analytics Engine", async () => {
      const mockBinding = createMockBinding();

      const adapter = createAnalyticsEngineLogsAdapter({
        analyticsEngineBinding: mockBinding,
        accountId: "test-account",
        apiToken: "test-token",
        dataset: "authhero_logs",
      });

      const log = await adapter.create("tenant-1", {
        type: "s",
        date: "2024-01-15T10:00:00.000Z",
        ip: "192.168.1.1",
        user_agent: "Mozilla/5.0",
        isMobile: false,
        user_id: "user-456",
        description: "User logged in",
      });

      // Verify log was returned with generated ID
      expect(log.log_id).toBeDefined();
      expect(log.type).toBe("s");
      expect(log.user_id).toBe("user-456");

      // Verify writeDataPoint was called
      expect(mockBinding.writeDataPoint).toHaveBeenCalledTimes(1);
      expect(mockBinding.dataPoints.length).toBe(1);

      // Verify the data structure
      const dataPoint = mockBinding.dataPoints[0]!;
      expect(dataPoint.indexes).toEqual(["tenant-1"]);
      expect(dataPoint.blobs?.[0]).toBe(log.log_id); // log_id
      expect(dataPoint.blobs?.[1]).toBe("tenant-1"); // tenant_id
      expect(dataPoint.blobs?.[2]).toBe("s"); // type
      expect(dataPoint.doubles?.[0]).toBe(0); // isMobile = false
    });

    it("should use provided log_id if present", async () => {
      const mockBinding = createMockBinding();

      const adapter = createAnalyticsEngineLogsAdapter({
        analyticsEngineBinding: mockBinding,
        accountId: "test-account",
        apiToken: "test-token",
      });

      const log = await adapter.create("tenant-1", {
        type: "s",
        date: "2024-01-15T10:00:00.000Z",
        ip: "192.168.1.1",
        user_agent: "Mozilla/5.0",
        isMobile: true,
        log_id: "custom-log-id",
      });

      expect(log.log_id).toBe("custom-log-id");
      expect(mockBinding.dataPoints[0]?.blobs?.[0]).toBe("custom-log-id");
      expect(mockBinding.dataPoints[0]?.doubles?.[0]).toBe(1); // isMobile = true
    });
  });

  describe("passthrough with core utility", () => {
    it("should sync writes to Analytics Engine using createPassthroughAdapter", async () => {
      const mockBinding = createMockBinding();

      // Primary adapter (e.g., R2 SQL or any other storage)
      const mockPrimaryAdapter: LogsDataAdapter = {
        create: vi.fn().mockResolvedValue({
          log_id: "primary-log-id",
          type: "s",
          date: "2024-01-15T10:00:00.000Z",
          isMobile: false,
        }),
        get: vi.fn().mockResolvedValue({
          log_id: "primary-log-id",
          type: "s",
          date: "2024-01-15T10:00:00.000Z",
          isMobile: false,
        }),
        list: vi.fn().mockResolvedValue({
          logs: [{ log_id: "primary-log-id", type: "s" }],
          start: 0,
          limit: 50,
          length: 1,
        }),
      };

      // Analytics Engine adapter for write syncing
      const analyticsEngineAdapter = createAnalyticsEngineLogsAdapter({
        analyticsEngineBinding: mockBinding,
        accountId: "test-account",
        apiToken: "test-token",
      });

      // Create passthrough adapter using core utility
      const passthroughAdapter = createPassthroughAdapter<LogsDataAdapter>({
        primary: mockPrimaryAdapter,
        secondaries: [
          {
            adapter: createWriteOnlyAdapter<LogsDataAdapter>({
              create: analyticsEngineAdapter.create,
            }),
          },
        ],
      });

      // Create a log - should write to both adapters
      const log = await passthroughAdapter.create("tenant-1", {
        type: "s",
        date: "2024-01-15T10:00:00.000Z",
        isMobile: false,
      });

      // Should return the primary adapter's result
      expect(log.log_id).toBe("primary-log-id");
      expect(mockPrimaryAdapter.create).toHaveBeenCalledTimes(1);

      // Should also write to Analytics Engine
      expect(mockBinding.writeDataPoint).toHaveBeenCalledTimes(1);
    });

    it("should read from primary adapter only", async () => {
      const mockBinding = createMockBinding();

      const mockPrimaryAdapter: LogsDataAdapter = {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue({
          log_id: "primary-log-id",
          type: "s",
          date: "2024-01-15T10:00:00.000Z",
          isMobile: false,
        }),
        list: vi.fn().mockResolvedValue({
          logs: [{ log_id: "primary-log-id", type: "s" }],
          start: 0,
          limit: 50,
          length: 1,
        }),
      };

      const analyticsEngineAdapter = createAnalyticsEngineLogsAdapter({
        analyticsEngineBinding: mockBinding,
        accountId: "test-account",
        apiToken: "test-token",
      });

      const passthroughAdapter = createPassthroughAdapter<LogsDataAdapter>({
        primary: mockPrimaryAdapter,
        secondaries: [
          {
            adapter: createWriteOnlyAdapter<LogsDataAdapter>({
              create: analyticsEngineAdapter.create,
            }),
          },
        ],
      });

      // Read operations should only hit primary
      const log = await passthroughAdapter.get("tenant-1", "primary-log-id");
      expect(log?.log_id).toBe("primary-log-id");
      expect(mockPrimaryAdapter.get).toHaveBeenCalledTimes(1);

      const result = await passthroughAdapter.list("tenant-1", {});
      expect(result.logs[0]?.log_id).toBe("primary-log-id");
      expect(mockPrimaryAdapter.list).toHaveBeenCalledTimes(1);
    });
  });

  describe("listLogs", () => {
    it("should query logs from Analytics Engine SQL API", async () => {
      const adapter = createAnalyticsEngineLogsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
        dataset: "authhero_logs",
      });

      const result = await adapter.list("tenant-1", {
        page: 0,
        per_page: 50,
      });

      expect(result.logs.length).toBe(1);
      expect(result.logs[0]?.log_id).toBe("log-123");
      expect(result.logs[0]?.type).toBe("s");
      expect(result.logs[0]?.user_id).toBe("user-456");
    });

    it("should include totals when requested", async () => {
      const adapter = createAnalyticsEngineLogsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
        dataset: "authhero_logs",
      });

      const result = await adapter.list("tenant-1", {
        page: 0,
        per_page: 50,
        include_totals: true,
      });

      expect(result.logs.length).toBe(1);
      expect(result.length).toBe(1);
    });
  });

  describe("getLogs", () => {
    it("should get a specific log from Analytics Engine SQL API", async () => {
      const adapter = createAnalyticsEngineLogsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
        dataset: "authhero_logs",
      });

      const log = await adapter.get("tenant-1", "log-123");

      expect(log).not.toBeNull();
      expect(log?.log_id).toBe("log-123");
      expect(log?.type).toBe("s");
    });

    it("should return null when log not found", async () => {
      server.use(
        http.post(
          "https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/sql",
          async () => {
            return HttpResponse.json({
              success: true,
              data: [],
            });
          },
        ),
      );

      const adapter = createAnalyticsEngineLogsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
        dataset: "authhero_logs",
      });

      const log = await adapter.get("tenant-1", "non-existent");

      expect(log).toBeNull();
    });
  });

  describe("formatLogFromStorage", () => {
    it("should correctly parse JSON fields", async () => {
      server.use(
        http.post(
          "https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/sql",
          async () => {
            return HttpResponse.json({
              success: true,
              data: [
                {
                  ...mockLogs[0],
                  blob19: '{"error":"invalid_grant"}',
                  blob20: '{"name":"auth0.js","version":"9.0.0"}',
                  blob21: '{"country_code":"US","city_name":"New York"}',
                },
              ],
            });
          },
        ),
      );

      const adapter = createAnalyticsEngineLogsAdapter({
        accountId: "test-account",
        apiToken: "test-token",
      });

      const log = await adapter.get("tenant-1", "log-123");

      expect(log?.details).toEqual({ error: "invalid_grant" });
      expect(log?.auth0_client).toEqual({
        name: "auth0.js",
        version: "9.0.0",
      });
      expect(log?.location_info).toEqual({
        country_code: "US",
        city_name: "New York",
      });
    });
  });
});
