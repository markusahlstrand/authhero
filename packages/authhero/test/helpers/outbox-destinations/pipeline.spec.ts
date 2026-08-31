import { describe, it, expect, vi } from "vitest";
import type { AuditEvent } from "@authhero/adapter-interfaces";
import {
  PipelineDestination,
  type PipelineRecord,
} from "../../../src/helpers/outbox-destinations/pipeline";

const ENDPOINT = "https://stream-1.ingest.cloudflare.com";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    tenant_id: "tenant-1",
    event_type: "branding.updated",
    log_type: "sapi",
    category: "admin_action",
    actor: { type: "admin", id: "admin-1", email: "admin@example.com" },
    target: {
      type: "branding",
      id: "branding",
      before: { colors: { primary: "#000" } },
      after: { colors: { primary: "#fff" } },
    },
    request: { method: "PATCH", path: "/api/v2/branding", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
}

function makeDestination(fetchImpl: typeof fetch) {
  return new PipelineDestination({
    endpoint: ENDPOINT,
    token: "ingest-token",
    fetchImpl,
  });
}

describe("PipelineDestination", () => {
  it("promotes the query and erasure keys and keeps the full event", () => {
    const dest = makeDestination(vi.fn());
    const event = makeEvent();

    expect(dest.transform(event)).toEqual({
      id: "evt-1",
      timestamp: "2026-05-21T00:00:00.000Z",
      tenant_id: "tenant-1",
      event_type: "branding.updated",
      log_type: "sapi",
      category: "admin_action",
      actor_id: "admin-1",
      target_type: "branding",
      target_id: "branding",
      event,
    });
  });

  it("emits actor_id as null rather than omitting it for anonymous actors", () => {
    const dest = makeDestination(vi.fn());
    const record = dest.transform(makeEvent({ actor: { type: "system" } }));

    expect(record.actor_id).toBeNull();
    expect("actor_id" in record).toBe(true);
  });

  it("archives audit events but not hook.* / controlplane.sync.* plumbing", () => {
    const dest = makeDestination(vi.fn());

    expect(dest.accepts(makeEvent())).toBe(true);
    expect(dest.accepts(makeEvent({ event_type: "s" }))).toBe(true);
    expect(
      dest.accepts(makeEvent({ event_type: "hook.post-user-registration" })),
    ).toBe(false);
    expect(
      dest.accepts(
        makeEvent({ event_type: "controlplane.sync.proxy_route.created" }),
      ),
    ).toBe(false);
  });

  it("POSTs the batch as a JSON array with a bearer token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const dest = makeDestination(fetchMock as unknown as typeof fetch);

    const records: PipelineRecord[] = [
      dest.transform(makeEvent()),
      dest.transform(makeEvent({ id: "evt-2" })),
    ];
    await dest.deliver(records);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBe("Bearer ingest-token");

    const body: unknown = JSON.parse(init.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual(records);
  });

  it("does not POST an empty batch", async () => {
    const fetchMock = vi.fn();
    await makeDestination(fetchMock as unknown as typeof fetch).deliver([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a non-https endpoint rather than sending the token in the clear", async () => {
    const fetchMock = vi.fn();

    expect(
      () =>
        new PipelineDestination({
          endpoint: "http://stream-1.ingest.cloudflare.com",
          token: "ingest-token",
          fetchImpl: fetchMock as unknown as typeof fetch,
        }),
    ).toThrow(/must use https/);
    expect(
      () => new PipelineDestination({ endpoint: "not-a-url", token: "t" }),
    ).toThrow(/not a valid URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx ingest response so the relay retries the event", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("bad schema", { status: 400 }));
    const dest = makeDestination(fetchMock as unknown as typeof fetch);

    await expect(dest.deliver([dest.transform(makeEvent())])).rejects.toThrow(
      /Pipeline ingest returned 400: bad schema/,
    );
  });
});
