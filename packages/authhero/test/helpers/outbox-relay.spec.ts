import { describe, it, expect, vi, beforeEach } from "vitest";
import { OutboxAdapter, OutboxEvent } from "@authhero/adapter-interfaces";
import {
  processOutboxEvents,
  drainOutbox,
  EventDestination,
} from "../../src/helpers/outbox-relay";

function makeOutboxEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: "evt-1",
    tenant_id: "tenant-1",
    event_type: "user.created",
    log_type: "sapi",
    description: "User created",
    category: "admin_action",
    actor: { type: "admin", id: "admin-1" },
    target: { type: "user", id: "user-1" },
    request: { method: "POST", path: "/users", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
    processed_at: null,
    retry_count: 0,
    next_retry_at: null,
    error: null,
    ...overrides,
  };
}

function makeOutbox(overrides: Partial<OutboxAdapter> = {}): OutboxAdapter {
  return {
    create: vi.fn().mockResolvedValue("evt-new"),
    getByIds: vi.fn().mockResolvedValue([]),
    getUnprocessed: vi.fn().mockResolvedValue([]),
    claimEvents: vi.fn().mockResolvedValue([]),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    markRetry: vi.fn().mockResolvedValue(undefined),
    deadLetter: vi.fn().mockResolvedValue(undefined),
    listFailed: vi.fn().mockResolvedValue({
      events: [],
      start: 0,
      limit: 50,
      length: 0,
    }),
    replay: vi.fn().mockResolvedValue(true),
    cleanup: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function makeDestination(
  overrides: Partial<EventDestination> = {},
): EventDestination {
  return {
    name: "test-destination",
    transform: vi.fn((e) => e),
    deliver: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("processOutboxEvents", () => {
  it("does nothing when ids array is empty", async () => {
    const outbox = makeOutbox();
    await processOutboxEvents(outbox, [], [makeDestination()]);

    expect(outbox.claimEvents).not.toHaveBeenCalled();
    expect(outbox.getByIds).not.toHaveBeenCalled();
  });

  it("claims events before processing", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const destination = makeDestination();

    await processOutboxEvents(outbox, ["evt-1"], [destination]);

    expect(outbox.claimEvents).toHaveBeenCalledWith(
      ["evt-1"],
      expect.any(String),
      30_000,
    );
    expect(outbox.getByIds).toHaveBeenCalledWith(["evt-1"]);
    expect(destination.deliver).toHaveBeenCalledTimes(1);
    expect(outbox.markProcessed).toHaveBeenCalledWith(["evt-1"]);
  });

  it("skips processing when no events could be claimed", async () => {
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue([]),
    });
    const destination = makeDestination();

    await processOutboxEvents(outbox, ["evt-1", "evt-2"], [destination]);

    expect(outbox.claimEvents).toHaveBeenCalled();
    expect(outbox.getByIds).not.toHaveBeenCalled();
    expect(destination.deliver).not.toHaveBeenCalled();
  });

  it("only fetches and processes claimed IDs when some fail to claim", async () => {
    const event1 = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      // Only evt-1 claimed; evt-2 was taken by another worker
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event1]),
    });
    const destination = makeDestination();

    await processOutboxEvents(outbox, ["evt-1", "evt-2"], [destination]);

    expect(outbox.getByIds).toHaveBeenCalledWith(["evt-1"]);
    expect(destination.deliver).toHaveBeenCalledTimes(1);
    expect(outbox.markProcessed).toHaveBeenCalledWith(["evt-1"]);
  });

  it("marks events as processed after successful delivery", async () => {
    const events = [
      makeOutboxEvent({ id: "evt-1" }),
      makeOutboxEvent({ id: "evt-2" }),
    ];
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1", "evt-2"]),
      getByIds: vi.fn().mockResolvedValue(events),
    });
    const destination = makeDestination();

    await processOutboxEvents(outbox, ["evt-1", "evt-2"], [destination]);

    expect(destination.deliver).toHaveBeenCalledTimes(2);
    expect(outbox.markProcessed).toHaveBeenCalledWith(["evt-1", "evt-2"]);
  });

  it("marks retry on delivery failure and does not mark as processed", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const destination = makeDestination({
      deliver: vi.fn().mockRejectedValue(new Error("delivery failed")),
    });

    await processOutboxEvents(outbox, ["evt-1"], [destination]);

    expect(outbox.markRetry).toHaveBeenCalledWith(
      "evt-1",
      "test-destination: delivery failed",
      expect.any(String),
    );
    expect(outbox.markProcessed).not.toHaveBeenCalled();
  });

  it("dead-letters exhausted events when retry_count exceeds maxRetries", async () => {
    const event = makeOutboxEvent({
      id: "evt-1",
      retry_count: 5,
      error: "last error",
    });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const destination = makeDestination();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await processOutboxEvents(outbox, ["evt-1"], [destination], {
      maxRetries: 5,
    });

    expect(destination.deliver).not.toHaveBeenCalled();
    expect(outbox.deadLetter).toHaveBeenCalledWith("evt-1", "last error");
    expect(outbox.markProcessed).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("dead-letters events that no destination accepts (routing bug)", async () => {
    const event = makeOutboxEvent({
      id: "evt-orphan",
      event_type: "hook.unknown-trigger",
    });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-orphan"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    // Only one destination, and it rejects this event_type.
    const destination = makeDestination({
      name: "logs",
      accepts: () => false,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await processOutboxEvents(outbox, ["evt-orphan"], [destination]);

    expect(destination.deliver).not.toHaveBeenCalled();
    expect(outbox.deadLetter).toHaveBeenCalledWith(
      "evt-orphan",
      expect.stringContaining("hook.unknown-trigger"),
    );
    expect(outbox.markProcessed).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("stops trying destinations after the first failure for an event", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const dest1 = makeDestination({
      name: "dest1",
      deliver: vi.fn().mockRejectedValue(new Error("fail")),
    });
    const dest2 = makeDestination({ name: "dest2" });

    await processOutboxEvents(outbox, ["evt-1"], [dest1, dest2]);

    expect(dest1.deliver).toHaveBeenCalledTimes(1);
    expect(dest2.deliver).not.toHaveBeenCalled();
  });
});

describe("drainOutbox", () => {
  it("does nothing when no unprocessed events exist", async () => {
    const outbox = makeOutbox({
      getUnprocessed: vi.fn().mockResolvedValue([]),
    });

    await drainOutbox(outbox, [makeDestination()]);

    expect(outbox.claimEvents).not.toHaveBeenCalled();
  });

  it("claims unprocessed events and delivers them", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      getUnprocessed: vi.fn().mockResolvedValue([event]),
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
    });
    const destination = makeDestination();

    await drainOutbox(outbox, [destination]);

    expect(outbox.claimEvents).toHaveBeenCalledWith(
      ["evt-1"],
      expect.any(String),
      30_000,
    );
    expect(destination.deliver).toHaveBeenCalledTimes(1);
    expect(outbox.markProcessed).toHaveBeenCalledWith(["evt-1"]);
  });

  it("skips events that could not be claimed", async () => {
    const events = [
      makeOutboxEvent({ id: "evt-1" }),
      makeOutboxEvent({ id: "evt-2" }),
    ];
    const outbox = makeOutbox({
      getUnprocessed: vi.fn().mockResolvedValue(events),
      // Only evt-2 claimed
      claimEvents: vi.fn().mockResolvedValue(["evt-2"]),
    });
    const destination = makeDestination();

    await drainOutbox(outbox, [destination]);

    // Should only deliver evt-2
    expect(destination.deliver).toHaveBeenCalledTimes(1);
    expect(outbox.markProcessed).toHaveBeenCalledWith(["evt-2"]);
  });

  it("does nothing when all claims fail", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      getUnprocessed: vi.fn().mockResolvedValue([event]),
      claimEvents: vi.fn().mockResolvedValue([]),
    });
    const destination = makeDestination();

    await drainOutbox(outbox, [destination]);

    expect(destination.deliver).not.toHaveBeenCalled();
    expect(outbox.markProcessed).not.toHaveBeenCalled();
  });

  it("calls cleanup after processing", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      getUnprocessed: vi.fn().mockResolvedValue([event]),
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
    });

    await drainOutbox(outbox, [makeDestination()]);

    expect(outbox.cleanup).toHaveBeenCalledWith(expect.any(String));
  });
});

describe("outbox metrics", () => {
  it("emits outbox_events_processed_total on successful delivery", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const metrics = vi.fn();

    await processOutboxEvents(outbox, ["evt-1"], [makeDestination()], {
      metrics,
    });

    expect(metrics).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledWith({
      name: "outbox_events_processed_total",
      value: 1,
      tenantId: "tenant-1",
      eventType: "user.created",
      source: "request",
      retryCount: 0,
    });
  });

  it("emits outbox_retry_delay_seconds with the backoff delay on failure", async () => {
    const event = makeOutboxEvent({ id: "evt-1", retry_count: 2 });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const metrics = vi.fn();
    const destination = makeDestination({
      deliver: vi.fn().mockRejectedValue(new Error("delivery failed")),
    });

    await processOutboxEvents(outbox, ["evt-1"], [destination], { metrics });

    // BASE_DELAY_MS (1000ms) * 2^2 = 4000ms
    expect(metrics).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledWith({
      name: "outbox_retry_delay_seconds",
      value: 4,
      tenantId: "tenant-1",
      eventType: "user.created",
      source: "request",
      destination: "test-destination",
      error: "delivery failed",
      retryCount: 2,
    });
  });

  it("emits outbox_events_dead_lettered_total when retries are exhausted", async () => {
    const event = makeOutboxEvent({
      id: "evt-1",
      retry_count: 5,
      error: "last error",
    });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const metrics = vi.fn();

    await processOutboxEvents(outbox, ["evt-1"], [makeDestination()], {
      maxRetries: 5,
      metrics,
    });

    expect(metrics).toHaveBeenCalledWith({
      name: "outbox_events_dead_lettered_total",
      value: 1,
      tenantId: "tenant-1",
      eventType: "user.created",
      source: "request",
      error: "last error",
      retryCount: 5,
    });
  });

  it("emits outbox_events_dead_lettered_total when no destination accepts", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const metrics = vi.fn();
    const destination = makeDestination({ accepts: () => false });

    await processOutboxEvents(outbox, ["evt-1"], [destination], { metrics });

    expect(metrics).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "outbox_events_dead_lettered_total",
        value: 1,
        error: "No destination accepts event_type=user.created",
      }),
    );
  });

  it("tags drainOutbox metrics with source=cron", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      getUnprocessed: vi.fn().mockResolvedValue([event]),
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
    });
    const metrics = vi.fn();

    await drainOutbox(outbox, [makeDestination()], { metrics });

    expect(metrics).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "outbox_events_processed_total",
        source: "cron",
      }),
    );
  });

  it("still delivers when no metrics sink is configured", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });

    await processOutboxEvents(outbox, ["evt-1"], [makeDestination()]);

    expect(outbox.markProcessed).toHaveBeenCalledWith(["evt-1"]);
  });

  it("keeps delivering when the metrics sink throws", async () => {
    const event = makeOutboxEvent({ id: "evt-1" });
    const outbox = makeOutbox({
      claimEvents: vi.fn().mockResolvedValue(["evt-1"]),
      getByIds: vi.fn().mockResolvedValue([event]),
    });
    const metrics = vi.fn(() => {
      throw new Error("sink is down");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await processOutboxEvents(outbox, ["evt-1"], [makeDestination()], {
      metrics,
    });

    expect(outbox.markProcessed).toHaveBeenCalledWith(["evt-1"]);
    consoleError.mockRestore();
  });
});
