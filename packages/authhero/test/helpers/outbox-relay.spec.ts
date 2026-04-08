import { describe, it, expect, vi, beforeEach } from "vitest";
import { OutboxAdapter, OutboxEvent } from "@authhero/adapter-interfaces";
import {
  processOutboxEvents,
  drainOutbox,
  EventDestination,
} from "../../src/helpers/outbox-relay";

function makeOutboxEvent(
  overrides: Partial<OutboxEvent> = {},
): OutboxEvent {
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

    await processOutboxEvents(
      outbox,
      ["evt-1", "evt-2"],
      [destination],
    );

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

    await processOutboxEvents(
      outbox,
      ["evt-1", "evt-2"],
      [destination],
    );

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

  it("marks exhausted events as processed when retry_count exceeds maxRetries", async () => {
    const event = makeOutboxEvent({ id: "evt-1", retry_count: 5 });
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
    expect(outbox.markProcessed).toHaveBeenCalledWith(["evt-1"]);
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
