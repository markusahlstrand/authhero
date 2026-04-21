import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  HooksAdapter,
  LogsDataAdapter,
  OutboxAdapter,
  OutboxEvent,
  UserDataAdapter,
} from "@authhero/adapter-interfaces";
import { createDefaultDestinations } from "../../src/helpers/default-destinations";
import { LogsDestination } from "../../src/helpers/outbox-destinations/logs";
import { WebhookDestination } from "../../src/helpers/outbox-destinations/webhooks";
import { RegistrationFinalizerDestination } from "../../src/helpers/outbox-destinations/registration-finalizer";
import { drainOutbox } from "../../src/helpers/outbox-relay";

function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
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

function makeOutbox(events: OutboxEvent[]): OutboxAdapter {
  const ids = events.map((e) => e.id);
  return {
    create: vi.fn().mockResolvedValue("evt-new"),
    getByIds: vi.fn().mockResolvedValue(events),
    getUnprocessed: vi.fn().mockResolvedValue(events),
    claimEvents: vi.fn().mockResolvedValue(ids),
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
  };
}

describe("createDefaultDestinations", () => {
  it("returns only the LogsDestination when no getServiceToken is provided", () => {
    const destinations = createDefaultDestinations({
      dataAdapter: {
        logs: {} as LogsDataAdapter,
        hooks: {} as HooksAdapter,
        users: {} as UserDataAdapter,
      },
    });

    expect(destinations).toHaveLength(1);
    expect(destinations[0]).toBeInstanceOf(LogsDestination);
  });

  it("returns logs + webhook + registration-finalizer in order when getServiceToken is provided", () => {
    const destinations = createDefaultDestinations({
      dataAdapter: {
        logs: {} as LogsDataAdapter,
        hooks: {} as HooksAdapter,
        users: {} as UserDataAdapter,
      },
      getServiceToken: async () => "token",
    });

    expect(destinations).toHaveLength(3);
    expect(destinations[0]).toBeInstanceOf(LogsDestination);
    expect(destinations[1]).toBeInstanceOf(WebhookDestination);
    // Must come after WebhookDestination so the flag only flips on success.
    expect(destinations[2]).toBeInstanceOf(RegistrationFinalizerDestination);
  });

  it("routes hook.* events through a consumer-supplied webhookInvoker instead of raw fetch", async () => {
    const hooks = {
      list: vi.fn().mockResolvedValue({
        hooks: [
          {
            hook_id: "h1",
            url: "https://example.test/hook",
            enabled: true,
            trigger_id: "post-user-registration",
          },
        ],
      }),
    } as unknown as HooksAdapter;
    const users = {
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as UserDataAdapter;

    const webhookInvoker = vi.fn(async () => new Response("ok", { status: 200 }));

    const destinations = createDefaultDestinations({
      dataAdapter: {
        logs: {} as LogsDataAdapter,
        hooks,
        users,
      },
      getServiceToken: async () => "svc-token",
      webhookInvoker,
    });

    // Drive the WebhookDestination directly to prove the invoker is wired in.
    const webhookDest = destinations.find(
      (d) => d instanceof WebhookDestination,
    ) as WebhookDestination;
    const event = makeEvent({
      event_type: "hook.post-user-registration",
      target: { type: "user", id: "user-1" },
    });
    await webhookDest.deliver([webhookDest.transform(event)]);

    expect(webhookInvoker).toHaveBeenCalledTimes(1);
    const call = webhookInvoker.mock.calls[0][0];
    expect(call.hook.hook_id).toBe("h1");
    expect(call.tenant_id).toBe("tenant-1");
    expect(call.data.trigger_id).toBe("post-user-registration");
    expect(typeof call.createServiceToken).toBe("function");
    expect(await call.createServiceToken()).toBe("svc-token");
    expect(await call.createServiceToken("custom-scope")).toBe("svc-token");
  });
});

describe("drainOutbox with createDefaultDestinations", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes non-hook events to the logs adapter", async () => {
    const logs = {
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as LogsDataAdapter;
    const hooks = {
      list: vi.fn().mockResolvedValue({ hooks: [] }),
    } as unknown as HooksAdapter;
    const users = {
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as UserDataAdapter;

    const event = makeEvent({ id: "log-evt", event_type: "user.created" });
    const outbox = makeOutbox([event]);

    const destinations = createDefaultDestinations({
      dataAdapter: { logs, hooks, users },
      getServiceToken: async () => "token",
    });

    await drainOutbox(outbox, destinations);

    expect(logs.create).toHaveBeenCalledTimes(1);
    expect(logs.create).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ log_id: "log-evt" }),
    );
    // Non-hook event must not invoke webhooks or finalizer.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
    expect(outbox.markProcessed).toHaveBeenCalledWith(["log-evt"]);
  });

  it("dispatches hook.* events through the webhook path", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

    const logs = {
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as LogsDataAdapter;
    const hooks = {
      list: vi.fn().mockResolvedValue({
        hooks: [
          {
            hook_id: "h1",
            url: "https://example.test/hook",
            enabled: true,
            trigger_id: "post-user-registration",
          },
        ],
      }),
    } as unknown as HooksAdapter;
    const users = {
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as UserDataAdapter;

    const event = makeEvent({
      id: "hook-evt",
      event_type: "hook.post-user-registration",
      target: { type: "user", id: "user-1" },
    });
    const outbox = makeOutbox([event]);

    const getServiceToken = vi.fn().mockResolvedValue("svc-token");

    const destinations = createDefaultDestinations({
      dataAdapter: { logs, hooks, users },
      getServiceToken,
    });

    await drainOutbox(outbox, destinations);

    // The webhook path fired with the expected headers.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/hook");
    expect(options.headers.Authorization).toBe("Bearer svc-token");
    expect(options.headers["Idempotency-Key"]).toBe("hook-evt");
    // Default HTTP invoker always requests the "webhook" scope.
    expect(getServiceToken).toHaveBeenCalledWith("tenant-1", "webhook");

    // LogsDestination filters out hook.* events.
    expect(logs.create).not.toHaveBeenCalled();

    // RegistrationFinalizer flipped the flag after successful webhook delivery.
    expect(users.update).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      expect.objectContaining({
        registration_completed_at: expect.any(String),
      }),
    );

    expect(outbox.markProcessed).toHaveBeenCalledWith(["hook-evt"]);
  });
});
