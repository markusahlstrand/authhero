import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditEvent, ProxyRoute } from "@authhero/adapter-interfaces";
import { ControlPlaneSyncDestination } from "../../../src/helpers/outbox-destinations/control-plane-sync";
import {
  CONTROL_PLANE_SYNC_EVENT_PREFIX,
  SyncEvent,
} from "../../../src/helpers/control-plane-sync-events";

function makeProxyRoute(overrides: Partial<ProxyRoute> = {}): ProxyRoute {
  return {
    id: "pr-1",
    tenant_id: "tenant-1",
    custom_domain_id: "cd-1",
    priority: 100,
    match: { path: "/*" },
    handlers: [{ type: "passthrough", options: {} }],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    tenant_id: "tenant-1",
    event_type: `${CONTROL_PLANE_SYNC_EVENT_PREFIX}proxy_route.created`,
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: {
      type: "proxy_route",
      id: "pr-1",
      after: makeProxyRoute() as unknown as Record<string, unknown>,
    },
    request: { method: "POST", path: "/proxy-routes", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

describe("ControlPlaneSyncDestination", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  function makeDest(timeoutMs?: number) {
    return new ControlPlaneSyncDestination({
      baseUrl: "https://controlplane.test/",
      getServiceToken: async (tenantId, scope) => `t-${tenantId}-${scope}`,
      fetchImpl: fetchMock,
      timeoutMs,
    });
  }

  it("accepts only controlplane.sync.* events", () => {
    const dest = makeDest();
    expect(dest.accepts(makeEvent())).toBe(true);
    expect(
      dest.accepts(makeEvent({ event_type: "hook.post-user-registration" })),
    ).toBe(false);
    expect(dest.accepts(makeEvent({ event_type: "user.created" }))).toBe(false);
  });

  it("transforms a created event into the wire SyncEvent shape", () => {
    const dest = makeDest();
    const transformed = dest.transform(makeEvent()) as SyncEvent;
    expect(transformed).toEqual({
      event_id: "evt-1",
      tenant_id: "tenant-1",
      entity: "proxy_route",
      op: "created",
      aggregate_id: "pr-1",
      payload: expect.objectContaining({ id: "pr-1" }),
      occurred_at: "2026-01-02T03:04:05.000Z",
    });
  });

  it("falls back to target.before when target.after is absent (delete events)", () => {
    const dest = makeDest();
    const evt = makeEvent({
      event_type: `${CONTROL_PLANE_SYNC_EVENT_PREFIX}proxy_route.deleted`,
      target: {
        type: "proxy_route",
        id: "pr-1",
        before: makeProxyRoute() as unknown as Record<string, unknown>,
      },
    });
    const transformed = dest.transform(evt) as SyncEvent;
    expect(transformed.op).toBe("deleted");
    expect(transformed.payload).toMatchObject({ id: "pr-1" });
  });

  it("throws on unknown entity / op suffixes", () => {
    const dest = makeDest();
    expect(() =>
      dest.transform(
        makeEvent({
          event_type: `${CONTROL_PLANE_SYNC_EVENT_PREFIX}unknown.created`,
        }),
      ),
    ).toThrow(/unknown entity/);
    expect(() =>
      dest.transform(
        makeEvent({
          event_type: `${CONTROL_PLANE_SYNC_EVENT_PREFIX}proxy_route.weird`,
        }),
      ),
    ).toThrow(/unknown op/);
  });

  it("no longer replicates custom_domain events — the control plane owns them", () => {
    const dest = makeDest();
    expect(() =>
      dest.transform(
        makeEvent({
          event_type: `${CONTROL_PLANE_SYNC_EVENT_PREFIX}custom_domain.created`,
        }),
      ),
    ).toThrow(/unknown entity/);
  });

  it("POSTs the event with Bearer token + Idempotency-Key + sync URL", async () => {
    const dest = makeDest();
    const transformed = dest.transform(makeEvent()) as SyncEvent;
    await dest.deliver([transformed]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://controlplane.test/api/v2/proxy/control-plane/sync",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer t-tenant-1-controlplane:sync",
      "Idempotency-Key": "evt-1",
    });
    expect(JSON.parse(init.body)).toEqual({
      events: [
        expect.objectContaining({
          event_id: "evt-1",
          entity: "proxy_route",
          op: "created",
        }),
      ],
    });
  });

  it("throws on non-2xx so the outbox retries", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("upstream-down", { status: 503 }),
    );
    const dest = makeDest();
    const transformed = dest.transform(makeEvent()) as SyncEvent;
    await expect(dest.deliver([transformed])).rejects.toThrow(
      /returned 503: upstream-down/,
    );
  });

  it("transforms an updated proxy_route event", async () => {
    const dest = makeDest();
    const evt = makeEvent({
      event_type: `${CONTROL_PLANE_SYNC_EVENT_PREFIX}proxy_route.updated`,
      target: {
        type: "proxy_route",
        id: "pr-1",
        after: makeProxyRoute() as unknown as Record<string, unknown>,
      },
    });
    const transformed = dest.transform(evt) as SyncEvent;
    expect(transformed.entity).toBe("proxy_route");
    expect(transformed.op).toBe("updated");
    await dest.deliver([transformed]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].entity).toBe("proxy_route");
    expect(body.events[0].payload).toMatchObject({ id: "pr-1" });
  });
});
