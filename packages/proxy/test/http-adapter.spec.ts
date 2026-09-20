import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHttpProxyAdapter } from "../src/http-adapter";
import type { ResolvedHost } from "../src/adapter";

const resolved: ResolvedHost = {
  tenant_id: "t1",
  custom_domain_id: "cd1",
  domain: "customer.com",
  routes: [],
};

function tokenResponse(): Response {
  return Response.json({ access_token: "tok", expires_in: 3600 });
}

describe("http proxy adapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The adapter used to hold the pending token fetch at adapter scope so
  // concurrent callers could share it. On Workers that promise belongs to the
  // request that started it: when that request goes away the promise may never
  // settle, and every later caller awaiting it hangs for the life of the
  // isolate. Each call mints on its own instead.
  it("does not let a stranded token fetch wedge later resolves", async () => {
    let tokenCalls = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/oauth/token") {
        tokenCalls += 1;
        if (tokenCalls === 1) return new Promise<Response>(() => {});
        return tokenResponse();
      }
      return Response.json(resolved);
    }) as unknown as typeof fetch;

    const adapter = createHttpProxyAdapter({
      baseUrl: "https://cp.example.com",
      clientId: "proxy",
      clientSecret: "secret",
      timeoutMs: 2000,
      fetch: fetchFn,
    });

    const stranded = expect(
      adapter.resolveHost("customer.com"),
    ).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(2100);
    await stranded;

    // The next caller must mint its own token rather than await the corpse.
    const after = adapter.resolveHost("customer.com");
    await vi.advanceTimersByTimeAsync(10);
    expect(await after).toEqual(resolved);
    expect(tokenCalls).toBe(2);
  });

  it("times out a response whose body never arrives", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/oauth/token") return tokenResponse();
      // Headers land immediately; the body never does. Before the deadline
      // covered the body read, this hung forever — the abort timer had already
      // been cleared when the fetch itself resolved.
      return new Response(
        new ReadableStream({
          start() {
            // Never enqueues, never closes.
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const adapter = createHttpProxyAdapter({
      baseUrl: "https://cp.example.com",
      clientId: "proxy",
      clientSecret: "secret",
      timeoutMs: 2000,
      fetch: fetchFn,
    });

    const pending = expect(adapter.resolveHost("customer.com")).rejects.toThrow(
      /timed out/,
    );
    await vi.advanceTimersByTimeAsync(2100);
    await pending;
  });

  it("reuses a cached token across resolves", async () => {
    let tokenCalls = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/oauth/token") {
        tokenCalls += 1;
        return tokenResponse();
      }
      return Response.json(resolved);
    }) as unknown as typeof fetch;

    const adapter = createHttpProxyAdapter({
      baseUrl: "https://cp.example.com",
      clientId: "proxy",
      clientSecret: "secret",
      fetch: fetchFn,
    });

    await adapter.resolveHost("a.example");
    await adapter.resolveHost("b.example");

    expect(tokenCalls).toBe(1);
  });
});
