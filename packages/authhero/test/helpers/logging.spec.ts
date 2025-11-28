import { describe, it, expect, vi, beforeEach } from "vitest";
import { Context } from "hono";
import { logMessage } from "../../src/helpers/logging";
import { GeoAdapter, GeoInfo } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../src/types";

// Mock geo adapter
class MockGeoAdapter implements GeoAdapter {
  private geoInfo: GeoInfo | null;

  constructor(geoInfo: GeoInfo | null = null) {
    this.geoInfo = geoInfo;
  }

  async getGeoInfo(): Promise<GeoInfo | null> {
    return this.geoInfo;
  }
}

describe("logging helper - geo functionality", () => {
  let ctx: Context<{ Bindings: Bindings; Variables: Variables }>;

  beforeEach(() => {
    // Create a mock context with all required properties
    ctx = {
      env: {
        data: {
          logs: {
            create: vi.fn().mockResolvedValue(undefined),
          },
        } as any,
      } as any,
      var: {
        ip: "127.0.0.1",
        useragent: "test-agent",
        auth0_client: "test-client",
        client_id: "test-client-id",
        user_id: "test-user-id",
        username: "testuser",
        connection: "test-connection",
        body: "test-body",
      },
      set: () => {},
      req: {
        method: "POST",
        path: "/test",
        queries: () => ({}),
        header: (name: string) => (name === "host" ? "localhost" : undefined),
      },
      executionCtx: {
        waitUntil: () => {},
        passThroughOnException: () => {},
      },
    } as any;
  });

  it("should include location_info when geo adapter returns geo data", async () => {
    const mockGeoInfo: GeoInfo = {
      country_code: "US",
      country_code3: "USA",
      country_name: "United States",
      city_name: "New York",
      latitude: "40.7128",
      longitude: "-74.0060",
      time_zone: "America/New_York",
      continent_code: "NA",
    };

    const mockGeoAdapter = new MockGeoAdapter(mockGeoInfo);

    // Add geo adapter to context
    ctx.env.data.geo = mockGeoAdapter;

    // Call logMessage
    await logMessage(ctx, "test-tenant", {
      type: "s",
      description: "Test log with geo",
      userId: "test-user",
      body: { test: "data" },
    });

    // Verify that logs.create was called with location_info
    expect(ctx.env.data.logs.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        type: "s",
        description: "Test log with geo",
        location_info: mockGeoInfo,
        details: expect.objectContaining({
          request: expect.objectContaining({
            body: { test: "data" },
          }),
        }),
      }),
    );
  });

  it("should not include location_info when geo adapter returns null", async () => {
    const mockGeoAdapter = new MockGeoAdapter(null);

    // Add geo adapter to context
    ctx.env.data.geo = mockGeoAdapter;

    // Call logMessage
    await logMessage(ctx, "test-tenant", {
      type: "s",
      description: "Test log without geo",
      userId: "test-user",
    });

    // Verify that logs.create was called without location_info
    expect(ctx.env.data.logs.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        type: "s",
        description: "Test log without geo",
        location_info: undefined,
        details: expect.objectContaining({
          request: expect.objectContaining({
            body: "test-body",
          }),
        }),
      }),
    );
  });

  it("should not include location_info when geo adapter is not available", async () => {
    // No geo adapter in context

    // Call logMessage
    await logMessage(ctx, "test-tenant", {
      type: "s",
      description: "Test log without geo adapter",
      userId: "test-user",
    });

    // Verify that logs.create was called without location_info
    expect(ctx.env.data.logs.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        type: "s",
        description: "Test log without geo adapter",
        location_info: undefined,
        details: expect.objectContaining({
          request: expect.objectContaining({
            body: "test-body",
          }),
        }),
      }),
    );
  });

  it("should handle geo adapter errors gracefully", async () => {
    // Mock geo adapter that throws an error
    const mockGeoAdapter = new MockGeoAdapter();
    vi.spyOn(mockGeoAdapter, "getGeoInfo").mockRejectedValue(
      new Error("Geo service unavailable"),
    );

    // Add geo adapter to context
    ctx.env.data.geo = mockGeoAdapter;

    // Mock console.warn to capture the warning
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    // Call logMessage
    await logMessage(ctx, "test-tenant", {
      type: "s",
      description: "Test log with geo error",
      userId: "test-user",
    });

    // Verify that the warning was logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Failed to get geo information:",
      expect.any(Error),
    );

    // Verify that logs.create was called without location_info despite the error
    expect(ctx.env.data.logs.create).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({
        type: "s",
        description: "Test log with geo error",
        location_info: undefined,
        details: expect.objectContaining({
          request: expect.objectContaining({
            body: "test-body",
          }),
        }),
      }),
    );

    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });
});
