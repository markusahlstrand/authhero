import { describe, it, expect, vi } from "vitest";
import { createAnalyticsEngineOutboxMetricsSink } from "../src/analytics-engine-outbox-metrics";

describe("createAnalyticsEngineOutboxMetricsSink", () => {
  it("writes a data point indexed by tenant", () => {
    const writeDataPoint = vi.fn();
    const sink = createAnalyticsEngineOutboxMetricsSink({
      analyticsEngineBinding: { writeDataPoint },
    });

    sink({
      name: "outbox_events_processed_total",
      value: 1,
      tenantId: "tenant-1",
      eventType: "hook.post-user-registration",
      source: "cron",
      retryCount: 2,
    });

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const [dataPoint] = writeDataPoint.mock.calls[0];
    expect(dataPoint.blobs).toEqual([
      "outbox_events_processed_total",
      "tenant-1",
      "hook.post-user-registration",
      "cron",
      "",
      "",
    ]);
    expect(dataPoint.doubles?.slice(0, 2)).toEqual([1, 2]);
    expect(dataPoint.indexes).toEqual(["tenant-1"]);
  });

  it("carries the destination and error for retry metrics", () => {
    const writeDataPoint = vi.fn();
    const sink = createAnalyticsEngineOutboxMetricsSink({
      analyticsEngineBinding: { writeDataPoint },
    });

    sink({
      name: "outbox_retry_delay_seconds",
      value: 4,
      tenantId: "tenant-1",
      eventType: "user.created",
      source: "request",
      destination: "webhooks",
      error: "502 Bad Gateway",
    });

    const [dataPoint] = writeDataPoint.mock.calls[0];
    expect(dataPoint.blobs?.[4]).toBe("webhooks");
    expect(dataPoint.blobs?.[5]).toBe("502 Bad Gateway");
    expect(dataPoint.doubles?.[0]).toBe(4);
  });

  it("truncates the index to 96 bytes", () => {
    const writeDataPoint = vi.fn();
    const sink = createAnalyticsEngineOutboxMetricsSink({
      analyticsEngineBinding: { writeDataPoint },
    });

    sink({
      name: "outbox_events_processed_total",
      value: 1,
      tenantId: "t".repeat(200),
      eventType: "user.created",
      source: "cron",
    });

    const [dataPoint] = writeDataPoint.mock.calls[0];
    expect(dataPoint.indexes?.[0]).toHaveLength(96);
  });

  it("bounds a multi-byte index by UTF-8 bytes, not code units", () => {
    const writeDataPoint = vi.fn();
    const sink = createAnalyticsEngineOutboxMetricsSink({
      analyticsEngineBinding: { writeDataPoint },
    });

    sink({
      name: "outbox_events_processed_total",
      value: 1,
      // 4 bytes per emoji — 96 code units would be 384 bytes.
      tenantId: "🎉".repeat(100),
      eventType: "user.created",
      source: "cron",
    });

    const [dataPoint] = writeDataPoint.mock.calls[0];
    const index: string = dataPoint.indexes[0];
    expect(new TextEncoder().encode(index).length).toBeLessThanOrEqual(96);
    // Cut on a code point boundary, never mid-surrogate-pair.
    expect(index).toBe("🎉".repeat(24));
  });

  it("is a silent no-op without a binding", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const sink = createAnalyticsEngineOutboxMetricsSink({});

    expect(() =>
      sink({
        name: "outbox_events_processed_total",
        value: 1,
        tenantId: "tenant-1",
        eventType: "user.created",
        source: "cron",
      }),
    ).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("swallows binding errors so delivery is never broken", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const sink = createAnalyticsEngineOutboxMetricsSink({
      analyticsEngineBinding: {
        writeDataPoint: () => {
          throw new Error("AE unavailable");
        },
      },
    });

    expect(() =>
      sink({
        name: "outbox_events_dead_lettered_total",
        value: 1,
        tenantId: "tenant-1",
        eventType: "user.created",
        source: "cron",
      }),
    ).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
