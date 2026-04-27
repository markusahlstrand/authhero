import { describe, it, expect } from "vitest";
import { validateConnectOrigin } from "../../../src/helpers/dcr/validate-connect-origin";

describe("validateConnectOrigin", () => {
  it("accepts https with any host", () => {
    const r = validateConnectOrigin("https://publisher.com/cb");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.origin).toBe("https://publisher.com");
      expect(r.isHttp).toBe(false);
      expect(r.isLoopback).toBe(false);
    }
  });

  it("accepts https with explicit port", () => {
    const r = validateConnectOrigin("https://publisher.com:8443/cb");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.origin).toBe("https://publisher.com:8443");
  });

  it("accepts http loopback (localhost) without allowlist", () => {
    const r = validateConnectOrigin("http://localhost:8888/cb");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.origin).toBe("http://localhost:8888");
      expect(r.isLoopback).toBe(true);
    }
  });

  it("accepts http loopback (127.0.0.1)", () => {
    const r = validateConnectOrigin("http://127.0.0.1:3000/cb");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isLoopback).toBe(true);
  });

  it("accepts http loopback (IPv6 [::1])", () => {
    const r = validateConnectOrigin("http://[::1]:3000/cb");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isLoopback).toBe(true);
  });

  it("rejects http://0.0.0.0 even with port", () => {
    expect(validateConnectOrigin("http://0.0.0.0:8888/cb").ok).toBe(false);
  });

  it("rejects https://0.0.0.0 too", () => {
    expect(validateConnectOrigin("https://0.0.0.0/cb").ok).toBe(false);
  });

  it("rejects IPv6 unspecified [::] even with port", () => {
    expect(validateConnectOrigin("http://[::]:8888/cb").ok).toBe(false);
    expect(validateConnectOrigin("https://[::]/cb").ok).toBe(false);
  });

  it("does not pattern-match localhost suffix (rejects localhost.attacker.com)", () => {
    expect(
      validateConnectOrigin("http://localhost.attacker.com/cb").ok,
    ).toBe(false);
  });

  it("normalizes trailing dot (Localhost. is loopback)", () => {
    const r = validateConnectOrigin("http://Localhost.:8888/cb");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.isLoopback).toBe(true);
      expect(r.origin).toBe("http://localhost:8888");
    }
  });

  it("rejects link-local IPv6 outside [::1]", () => {
    expect(validateConnectOrigin("http://[fe80::1]:3000/cb").ok).toBe(false);
  });

  it("rejects private IPv4 ranges without allowlist entry", () => {
    expect(validateConnectOrigin("http://192.168.1.10:3000/cb").ok).toBe(
      false,
    );
  });

  it("accepts private IPv4 when allowlisted", () => {
    const r = validateConnectOrigin("http://192.168.1.10:3000/cb", [
      "http://192.168.1.10:3000",
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.isAllowlisted).toBe(true);
      expect(r.isLoopback).toBe(false);
    }
  });

  it("rejects schemes other than http/https", () => {
    expect(validateConnectOrigin("javascript:alert(1)").ok).toBe(false);
    expect(validateConnectOrigin("file:///etc/passwd").ok).toBe(false);
  });

  it("rejects malformed URL", () => {
    expect(validateConnectOrigin("not a url").ok).toBe(false);
  });

  it("allowlist match is case-insensitive on scheme/host", () => {
    const r = validateConnectOrigin("http://DEV.publisher.test:8080/cb", [
      "http://dev.publisher.test:8080",
    ]);
    expect(r.ok).toBe(true);
  });
});
