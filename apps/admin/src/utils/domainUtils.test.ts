import { describe, it, expect } from "vitest";
import { deriveTenantSubdomainUrl } from "./domainUtils";

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
