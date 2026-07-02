// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://localhost:3000/admin"}
import { describe, it, expect } from "vitest";
import { buildUrlWithProtocol, deriveTenantSubdomainUrl } from "./domainUtils";

describe("buildUrlWithProtocol", () => {
  it("follows the page protocol for a same-origin domain without scheme", () => {
    // The bundled admin UI is served from the auth server itself (here
    // https://localhost:3000/admin), so its API must use the same protocol.
    expect(buildUrlWithProtocol("localhost:3000")).toBe(
      "https://localhost:3000",
    );
  });

  it("defaults to https for other domains without scheme", () => {
    expect(buildUrlWithProtocol("localhost:4000")).toBe(
      "https://localhost:4000",
    );
    expect(buildUrlWithProtocol("auth.example.com")).toBe(
      "https://auth.example.com",
    );
  });

  it("preserves an explicit http scheme for loopback hosts", () => {
    expect(buildUrlWithProtocol("http://localhost:8787")).toBe(
      "http://localhost:8787",
    );
    expect(buildUrlWithProtocol("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("upgrades an explicit http scheme to https for non-loopback hosts", () => {
    expect(buildUrlWithProtocol("http://auth.example.com")).toBe(
      "https://auth.example.com",
    );
  });

  it("preserves an explicit https scheme", () => {
    expect(buildUrlWithProtocol("https://localhost:3000")).toBe(
      "https://localhost:3000",
    );
  });
});

describe("deriveTenantSubdomainUrl", () => {
  it("prefixes the tenant id as a subdomain", () => {
    expect(deriveTenantSubdomainUrl("https://api.example.com", "kvartal")).toBe(
      "https://kvartal.api.example.com/",
    );
  });

  it("preserves a non-default port and path", () => {
    expect(
      deriveTenantSubdomainUrl(
        "https://api.example.com:8443/some/path",
        "kvartal",
      ),
    ).toBe("https://kvartal.api.example.com:8443/some/path");
  });

  it("lowercases the tenant id (DNS labels are case-insensitive)", () => {
    expect(deriveTenantSubdomainUrl("https://api.example.com", "Kvartal")).toBe(
      "https://kvartal.api.example.com/",
    );
  });

  it("returns null for loopback hosts (local dev keeps the header path)", () => {
    expect(deriveTenantSubdomainUrl("http://localhost:3000", "kvartal")).toBe(
      null,
    );
    expect(deriveTenantSubdomainUrl("http://127.0.0.1:3000", "kvartal")).toBe(
      null,
    );
  });

  it("returns null for IPv4 hosts", () => {
    expect(deriveTenantSubdomainUrl("https://10.0.0.5", "kvartal")).toBe(null);
  });

  it("returns null for IPv6 hosts", () => {
    expect(deriveTenantSubdomainUrl("https://[::1]:3000", "kvartal")).toBe(null);
  });

  it("returns null for tenant ids that aren't valid DNS labels", () => {
    expect(
      deriveTenantSubdomainUrl("https://api.example.com", "has space"),
    ).toBe(null);
    expect(
      deriveTenantSubdomainUrl("https://api.example.com", "under_score"),
    ).toBe(null);
    expect(
      deriveTenantSubdomainUrl("https://api.example.com", "-leading-dash"),
    ).toBe(null);
    expect(deriveTenantSubdomainUrl("https://api.example.com", "")).toBe(null);
  });

  it("returns null for an unparseable base url", () => {
    expect(deriveTenantSubdomainUrl("not a url", "kvartal")).toBe(null);
  });
});
