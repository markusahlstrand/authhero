import { describe, it, expect, vi, afterEach } from "vitest";
import {
  assertSsrfSafeUrl,
  ssrfSafeFetch,
  SsrfBlockedError,
} from "../../src/utils/ssrf-fetch";

describe("assertSsrfSafeUrl", () => {
  it("accepts an https URL with a public hostname", () => {
    const url = assertSsrfSafeUrl("https://example.com/.well-known/jwks.json");
    expect(url.hostname).toBe("example.com");
  });

  it("rejects http by default", () => {
    expect(() => assertSsrfSafeUrl("http://example.com/x")).toThrow(
      SsrfBlockedError,
    );
  });

  it("accepts http when explicitly allowed", () => {
    const url = assertSsrfSafeUrl("http://example.com/x", {
      allowedSchemes: ["http:", "https:"],
    });
    expect(url.protocol).toBe("http:");
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "127.5.6.7",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.254",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
  ])("rejects private/loopback hostname %s", (host) => {
    expect(() => assertSsrfSafeUrl(`https://${host}/x`)).toThrow(
      SsrfBlockedError,
    );
  });

  it("rejects IPv6 loopback ::1", () => {
    expect(() => assertSsrfSafeUrl("https://[::1]/x")).toThrow(
      SsrfBlockedError,
    );
  });

  it("rejects IPv6 link-local fe80::1", () => {
    expect(() => assertSsrfSafeUrl("https://[fe80::1]/x")).toThrow(
      SsrfBlockedError,
    );
  });

  it.each(["fe81::1", "feaa::1", "febf::1"])(
    "rejects IPv6 link-local %s in fe80::/10",
    (host) => {
      expect(() => assertSsrfSafeUrl(`https://[${host}]/x`)).toThrow(
        SsrfBlockedError,
      );
    },
  );

  it.each([
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "::127.0.0.1",
  ])("rejects IPv4-mapped IPv6 form %s", (host) => {
    expect(() => assertSsrfSafeUrl(`https://[${host}]/x`)).toThrow(
      SsrfBlockedError,
    );
  });

  it("rejects IPv6 unique-local fc00::1", () => {
    expect(() => assertSsrfSafeUrl("https://[fc00::1]/x")).toThrow(
      SsrfBlockedError,
    );
  });

  it("does NOT reject 172.15.x or 172.32.x (just outside the /12 block)", () => {
    expect(() => assertSsrfSafeUrl("https://172.15.0.1/x")).not.toThrow();
    expect(() => assertSsrfSafeUrl("https://172.32.0.1/x")).not.toThrow();
  });

  it("allows private hostnames when allowPrivateHosts=true (test mode)", () => {
    const url = assertSsrfSafeUrl("http://127.0.0.1:8080/x", {
      allowPrivateHosts: true,
      allowedSchemes: ["http:", "https:"],
    });
    expect(url.hostname).toBe("127.0.0.1");
  });

  it("rejects malformed URLs", () => {
    expect(() => assertSsrfSafeUrl("not-a-url")).toThrow(SsrfBlockedError);
  });
});

describe("ssrfSafeFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws SsrfBlockedError on a 3xx redirect response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com" },
      }),
    );

    await expect(
      ssrfSafeFetch("https://example.com/.well-known/jwks.json"),
    ).rejects.toThrow(SsrfBlockedError);
  });
});
