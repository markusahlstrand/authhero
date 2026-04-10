import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../src/types";
import { OutboxAdapter } from "@authhero/adapter-interfaces";

vi.mock("../../src/helpers/wait-until", () => ({
  waitUntil: vi.fn(),
}));

vi.mock("../../src/helpers/outbox-relay", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/helpers/outbox-relay")>();
  return {
    ...original,
    processOutboxEvents: vi.fn().mockResolvedValue(undefined),
  };
});

import { outboxMiddleware } from "../../src/middlewares/outbox";
import { processOutboxEvents } from "../../src/helpers/outbox-relay";
import { waitUntil } from "../../src/helpers/wait-until";

function makeOutbox(
  overrides: Partial<OutboxAdapter> = {},
): OutboxAdapter {
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

function makeDestination() {
  return {
    name: "test-destination",
    transform: vi.fn((e: unknown) => e),
    deliver: vi.fn().mockResolvedValue(undefined),
  };
}

describe("outboxMiddleware", () => {
  let app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>;
  let outbox: OutboxAdapter;
  let destination: ReturnType<typeof makeDestination>;

  beforeEach(() => {
    vi.clearAllMocks();
    outbox = makeOutbox();
    destination = makeDestination();
    app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();
  });

  it("initializes outboxEventPromises to an empty array before next()", async () => {
    let capturedPromises: Promise<string>[] | undefined;

    app.use(
      outboxMiddleware({
        getOutbox: () => outbox,
        getDestinations: () => [destination],
      }),
    );

    app.get("/test", (c) => {
      capturedPromises = c.get("outboxEventPromises");
      return c.json({ ok: true });
    });

    await app.request("/test");

    expect(capturedPromises).toEqual([]);
  });

  it("calls processOutboxEvents when event promises are collected", async () => {
    app.use(
      outboxMiddleware({
        getOutbox: () => outbox,
        getDestinations: () => [destination],
      }),
    );

    app.get("/test", (c) => {
      const promises = c.get("outboxEventPromises") || [];
      promises.push(Promise.resolve("evt-1"));
      c.set("outboxEventPromises", promises);
      return c.json({ ok: true });
    });

    const response = await app.request("/test", undefined, {} as Bindings);
    expect(response.status).toBe(200);

    expect(waitUntil).toHaveBeenCalled();
    expect(processOutboxEvents).toHaveBeenCalledWith(
      outbox,
      ["evt-1"],
      [destination],
      { maxRetries: undefined },
    );
  });

  it("processes multiple event promises collected during a request", async () => {
    app.use(
      outboxMiddleware({
        getOutbox: () => outbox,
        getDestinations: () => [destination],
      }),
    );

    app.get("/test", (c) => {
      const promises = c.get("outboxEventPromises") || [];
      promises.push(
        Promise.resolve("evt-1"),
        Promise.resolve("evt-2"),
        Promise.resolve("evt-3"),
      );
      c.set("outboxEventPromises", promises);
      return c.json({ ok: true });
    });

    await app.request("/test", undefined, {} as Bindings);

    expect(processOutboxEvents).toHaveBeenCalledWith(
      outbox,
      ["evt-1", "evt-2", "evt-3"],
      [destination],
      expect.any(Object),
    );
  });

  it("does not process when no event promises are collected", async () => {
    app.use(
      outboxMiddleware({
        getOutbox: () => outbox,
        getDestinations: () => [destination],
      }),
    );

    app.get("/test", (c) => c.json({ ok: true }));

    await app.request("/test");

    expect(waitUntil).not.toHaveBeenCalled();
    expect(processOutboxEvents).not.toHaveBeenCalled();
  });

  it("does not process when getOutbox returns undefined", async () => {
    app.use(
      outboxMiddleware({
        getOutbox: () => undefined,
        getDestinations: () => [destination],
      }),
    );

    app.get("/test", (c) => {
      const promises = c.get("outboxEventPromises") || [];
      promises.push(Promise.resolve("evt-1"));
      c.set("outboxEventPromises", promises);
      return c.json({ ok: true });
    });

    await app.request("/test");

    expect(waitUntil).not.toHaveBeenCalled();
    expect(processOutboxEvents).not.toHaveBeenCalled();
  });

  it("passes maxRetries from env.outbox config", async () => {
    app.use(
      outboxMiddleware({
        getOutbox: () => outbox,
        getDestinations: () => [destination],
      }),
    );

    app.get("/test", (c) => {
      const promises = c.get("outboxEventPromises") || [];
      promises.push(Promise.resolve("evt-1"));
      c.set("outboxEventPromises", promises);
      return c.json({ ok: true });
    });

    await app.request("/test", undefined, {
      outbox: { enabled: true, maxRetries: 10 },
    } as Partial<Bindings>);

    expect(processOutboxEvents).toHaveBeenCalledWith(
      outbox,
      ["evt-1"],
      [destination],
      { maxRetries: 10 },
    );
  });

  it("awaits pending promises from non-awaited logMessage calls", async () => {
    app.use(
      outboxMiddleware({
        getOutbox: () => outbox,
        getDestinations: () => [destination],
      }),
    );

    app.get("/test", (c) => {
      const promises = c.get("outboxEventPromises") || [];
      // Simulate a slow async outbox.create (like a non-awaited logMessage)
      promises.push(
        new Promise((resolve) => setTimeout(() => resolve("evt-delayed"), 50)),
      );
      c.set("outboxEventPromises", promises);
      return c.json({ ok: true });
    });

    await app.request("/test", undefined, {} as Bindings);

    expect(processOutboxEvents).toHaveBeenCalledWith(
      outbox,
      ["evt-delayed"],
      [destination],
      expect.any(Object),
    );
  });
});
