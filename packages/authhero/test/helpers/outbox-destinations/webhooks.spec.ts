import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AuditEvent, HooksAdapter } from "@authhero/adapter-interfaces";
import { WebhookDestination } from "../../../src/helpers/outbox-destinations/webhooks";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-42",
    tenant_id: "tenant-1",
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: {
      type: "user",
      id: "user-1",
      after: { user_id: "user-1", email: "a@b.com" } as any,
    },
    request: { method: "POST", path: "/users", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeHooksAdapter(
  hooks: Array<{
    hook_id: string;
    url: string;
    enabled: boolean;
    trigger_id: string;
  }>,
): HooksAdapter {
  return {
    list: vi.fn().mockResolvedValue({ hooks }),
  } as unknown as HooksAdapter;
}

describe("WebhookDestination", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only hook.* events", () => {
    const dest = new WebhookDestination(
      makeHooksAdapter([]),
      async () => "token",
    );
    expect(dest.accepts(makeEvent())).toBe(true);
    expect(dest.accepts(makeEvent({ event_type: "user.created" }))).toBe(false);
  });

  it("posts to each matching enabled webhook with an Idempotency-Key", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    const adapter = makeHooksAdapter([
      {
        hook_id: "h1",
        url: "https://a.test/hook",
        enabled: true,
        trigger_id: "post-user-registration",
      },
      {
        hook_id: "h2",
        url: "https://b.test/hook",
        enabled: true,
        trigger_id: "post-user-registration",
      },
      {
        hook_id: "h3",
        url: "https://c.test/hook",
        enabled: false,
        trigger_id: "post-user-registration",
      },
      {
        hook_id: "h4",
        url: "https://d.test/hook",
        enabled: true,
        trigger_id: "post-user-login",
      },
    ]);
    const dest = new WebhookDestination(adapter, async () => "svc-token");

    const event = makeEvent();
    await dest.deliver([dest.transform(event)]);

    // Only h1 + h2 match: enabled + correct trigger_id.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const [, options] = call;
      expect(options.method).toBe("POST");
      expect(options.headers["Idempotency-Key"]).toBe("evt-42");
      expect(options.headers.Authorization).toBe("Bearer svc-token");
      const body = JSON.parse(options.body);
      expect(body.trigger_id).toBe("post-user-registration");
      expect(body.tenant_id).toBe("tenant-1");
    }
  });

  it("throws when a webhook returns non-2xx so the relay retries", async () => {
    fetchMock.mockResolvedValue(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );
    const adapter = makeHooksAdapter([
      {
        hook_id: "h1",
        url: "https://a.test/hook",
        enabled: true,
        trigger_id: "post-user-registration",
      },
    ]);
    const dest = new WebhookDestination(adapter, async () => "token");

    await expect(
      dest.deliver([dest.transform(makeEvent())]),
    ).rejects.toThrow(/h1.*post-user-registration.*500/);
  });

  it("does nothing when no webhooks match the trigger_id", async () => {
    const adapter = makeHooksAdapter([
      {
        hook_id: "h4",
        url: "https://d.test/hook",
        enabled: true,
        trigger_id: "post-user-login",
      },
    ]);
    const dest = new WebhookDestination(adapter, async () => "token");

    await dest.deliver([dest.transform(makeEvent())]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
