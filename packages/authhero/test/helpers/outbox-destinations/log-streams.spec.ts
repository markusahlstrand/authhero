import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  AuditEvent,
  LogStream,
  LogStreamsAdapter,
} from "@authhero/adapter-interfaces";
import { LogStreamDestination } from "../../../src/helpers/outbox-destinations/log-streams";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    tenant_id: "tenant-1",
    event_type: "user.created",
    log_type: "sapi",
    category: "api",
    actor: { type: "admin", email: "admin@example.com" },
    target: { type: "user", id: "user-1" },
    request: { method: "POST", path: "/users", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
}

function makeStreams(streams: LogStream[]): LogStreamsAdapter {
  return {
    list: vi.fn().mockResolvedValue(streams),
  } as unknown as LogStreamsAdapter;
}

describe("LogStreamDestination", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects hook.* events", () => {
    const dest = new LogStreamDestination(makeStreams([]));
    expect(dest.accepts(makeEvent())).toBe(true);
    expect(dest.accepts(makeEvent({ event_type: "hook.foo" }))).toBe(false);
  });

  it("does not POST when there are no active http streams", async () => {
    const dest = new LogStreamDestination(
      makeStreams([
        {
          id: "lst_1",
          name: "paused",
          type: "http",
          status: "paused",
          sink: { http_endpoint: "https://nope.test" },
        },
        {
          id: "lst_2",
          name: "datadog",
          type: "datadog",
          status: "active",
          sink: {},
        },
      ]),
    );
    await dest.deliver([dest.transform(makeEvent())]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to active http sink with auth + content type headers", async () => {
    const dest = new LogStreamDestination(
      makeStreams([
        {
          id: "lst_1",
          name: "loki",
          type: "http",
          status: "active",
          sink: {
            http_endpoint: "https://logs.test/in",
            http_authorization: "Basic abc",
            http_content_type: "application/json",
            http_content_format: "JSONARRAY",
          },
        },
      ]),
    );
    await dest.deliver([dest.transform(makeEvent())]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://logs.test/in");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBe("Basic abc");
    const body = JSON.parse(init.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].log_id).toBe("evt-1");
    expect(body[0].data.tenant_name).toBe("tenant-1");
    expect(body[0].data.type).toBe("sapi");
  });

  it("encodes JSONLINES format with trailing newline", async () => {
    const dest = new LogStreamDestination(
      makeStreams([
        {
          id: "lst_1",
          name: "lines",
          type: "http",
          status: "active",
          sink: {
            http_endpoint: "https://logs.test/in",
            http_content_format: "JSONLINES",
          },
        },
      ]),
    );
    await dest.deliver([dest.transform(makeEvent())]);
    const init = fetchMock.mock.calls[0][1];
    expect(init.body.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(init.body.trim());
    expect(parsed.log_id).toBe("evt-1");
  });

  it("encodes JSONOBJECT format as a bare object", async () => {
    const dest = new LogStreamDestination(
      makeStreams([
        {
          id: "lst_1",
          name: "obj",
          type: "http",
          status: "active",
          sink: {
            http_endpoint: "https://logs.test/in",
            http_content_format: "JSONOBJECT",
          },
        },
      ]),
    );
    await dest.deliver([dest.transform(makeEvent())]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Array.isArray(body)).toBe(false);
    expect(body.log_id).toBe("evt-1");
  });

  it("applies filter by log_type", async () => {
    const dest = new LogStreamDestination(
      makeStreams([
        {
          id: "lst_1",
          name: "filtered",
          type: "http",
          status: "active",
          sink: { http_endpoint: "https://logs.test/in" },
          filters: [{ type: "category", name: "fp" }],
        },
      ]),
    );
    await dest.deliver([dest.transform(makeEvent({ log_type: "sapi" }))]);
    expect(fetchMock).not.toHaveBeenCalled();

    await dest.deliver([dest.transform(makeEvent({ log_type: "fp" }))]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("merges http_custom_headers", async () => {
    const dest = new LogStreamDestination(
      makeStreams([
        {
          id: "lst_1",
          name: "custom",
          type: "http",
          status: "active",
          sink: {
            http_endpoint: "https://logs.test/in",
            http_custom_headers: [
              { header: "X-Source", value: "authhero" },
              { header: "X-Env", value: "prod" },
            ],
          },
        },
      ]),
    );
    await dest.deliver([dest.transform(makeEvent())]);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["X-Source"]).toBe("authhero");
    expect(headers["X-Env"]).toBe("prod");
  });

  it("throws when sink response is not ok so outbox can retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("oh no", { status: 500 }));
    const dest = new LogStreamDestination(
      makeStreams([
        {
          id: "lst_1",
          name: "broken",
          type: "http",
          status: "active",
          sink: { http_endpoint: "https://logs.test/in" },
        },
      ]),
    );
    await expect(
      dest.deliver([dest.transform(makeEvent())]),
    ).rejects.toThrow(/500/);
  });
});
