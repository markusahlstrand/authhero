import { describe, it, expect } from "vitest";
import {
  toMutableResponse,
  ensureMutableResponse,
} from "../../src/helpers/mutable-response";

/**
 * Simulate a response received from `fetch()` / a dispatch namespace: its
 * headers throw on any mutation, exactly like the runtime's immutable guard.
 */
function immutableResponse(body: string | null, status = 200): Response {
  const res = new Response(body, { status });
  const throwImmutable = () => {
    throw new TypeError("Can't modify immutable headers.");
  };
  for (const method of ["append", "set", "delete"] as const) {
    Object.defineProperty(res.headers, method, {
      value: throwImmutable,
      configurable: true,
    });
  }
  return res;
}

describe("toMutableResponse", () => {
  it("re-wraps an immutable response so its headers can be written", async () => {
    const res = toMutableResponse(immutableResponse("hello"));

    expect(() => res.headers.set("X-Test", "1")).not.toThrow();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });

  it("preserves status, body, and existing headers", async () => {
    const original = new Response("body", {
      status: 503,
      headers: { "X-Existing": "kept" },
    });
    const res = toMutableResponse(original);

    expect(res.status).toBe(503);
    expect(res.headers.get("X-Existing")).toBe("kept");
    expect(await res.text()).toBe("body");
  });

  it("is safe on a null-body status (204/304)", () => {
    const res = toMutableResponse(immutableResponse(null, 204));
    expect(res.status).toBe(204);
    expect(() => res.headers.set("X-Test", "1")).not.toThrow();
  });

  it("leaves a WebSocket upgrade untouched (same reference)", () => {
    // A 101 Response can't be constructed in undici (status must be >= 200), but
    // the carve-out's real trigger is the `webSocket` handle reconstruction would
    // drop — simulate that.
    const upgrade = new Response(null, { status: 200 });
    Object.defineProperty(upgrade, "webSocket", { value: {} });
    expect(toMutableResponse(upgrade)).toBe(upgrade);
  });
});

describe("ensureMutableResponse", () => {
  it("replaces c.res with a writable response in place", () => {
    const c = { res: immutableResponse("x") };
    ensureMutableResponse(c);
    expect(() => c.res.headers.set("X-Test", "1")).not.toThrow();
  });

  it("is idempotent and preserves headers written between calls", () => {
    const c = { res: immutableResponse("x") };
    ensureMutableResponse(c);
    c.res.headers.set("X-First", "1");
    ensureMutableResponse(c);
    c.res.headers.set("X-Second", "2");
    expect(c.res.headers.get("X-First")).toBe("1");
    expect(c.res.headers.get("X-Second")).toBe("2");
  });
});
