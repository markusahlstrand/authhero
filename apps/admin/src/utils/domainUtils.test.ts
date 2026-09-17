// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://localhost:3000/admin"}
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DOMAINS_STORAGE_KEY,
  SELECTED_DOMAIN_STORAGE_KEY,
  buildUrlWithProtocol,
  deriveTenantSubdomainUrl,
  formatDomain,
  getClientIdFromStorage,
  getDomainFromStorage,
  getSelectedDomainFromStorage,
  saveDomainToStorage,
  saveSelectedDomainToStorage,
} from "./domainUtils";
import type { AdminConfig } from "./runtimeConfig";

function setRuntimeConfig(config: AdminConfig) {
  // Pin every key the domain helpers read so build-time env can't leak in.
  window.__AUTHHERO_ADMIN_CONFIG__ = {
    domain: "",
    clientId: "",
    apiUrl: "",
    useTenantSubdomains: "",
    ...config,
  };
}

function storeRaw(value: unknown) {
  localStorage.setItem(DOMAINS_STORAGE_KEY, JSON.stringify(value));
}

describe("formatDomain", () => {
  it("strips the protocol and surrounding whitespace", () => {
    expect(formatDomain("https://auth.example.com")).toBe("auth.example.com");
    expect(formatDomain("http://localhost:3000")).toBe("localhost:3000");
    expect(formatDomain("  auth.example.com  ")).toBe("auth.example.com");
  });

  it("leaves a bare domain untouched", () => {
    expect(formatDomain("auth.example.com")).toBe("auth.example.com");
  });
});

describe("domain storage", () => {
  beforeEach(() => {
    localStorage.clear();
    setRuntimeConfig({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getDomainFromStorage", () => {
    it("returns an empty list when nothing is stored or configured", () => {
      expect(getDomainFromStorage()).toEqual([]);
    });

    it("returns stored domain configs as-is", () => {
      const stored = [
        {
          url: "auth.example.com",
          connectionMethod: "client_credentials",
          clientId: "cc-client",
          clientSecret: "secret",
        },
        { url: "token.example.com", connectionMethod: "token", token: "t" },
      ];
      storeRaw(stored);

      expect(getDomainFromStorage()).toEqual(stored);
    });

    it("converts legacy string entries to login configs", () => {
      storeRaw(["legacy.example.com"]);

      expect(getDomainFromStorage()).toEqual([
        {
          url: "legacy.example.com",
          connectionMethod: "login",
          clientId: "",
        },
      ]);
    });

    it("defaults a missing connectionMethod to login", () => {
      storeRaw([{ url: "auth.example.com", clientId: "abc" }]);

      expect(getDomainFromStorage()).toEqual([
        { url: "auth.example.com", clientId: "abc", connectionMethod: "login" },
      ]);
    });

    it("drops null and empty entries", () => {
      storeRaw([null, "", "   ", { url: "" }, "kept.example.com"]);

      expect(getDomainFromStorage().map((d) => d.url)).toEqual([
        "kept.example.com",
      ]);
    });

    it("ignores stored JSON that isn't an array", () => {
      storeRaw({ url: "auth.example.com" });

      expect(getDomainFromStorage()).toEqual([]);
    });

    it("prepends the configured default domain when it isn't stored", () => {
      storeRaw([{ url: "other.example.com", connectionMethod: "token" }]);
      setRuntimeConfig({
        domain: "https://env.example.com",
        clientId: "env-client",
        apiUrl: "https://api.env.example.com",
      });

      expect(getDomainFromStorage()).toEqual([
        {
          url: "env.example.com",
          connectionMethod: "login",
          clientId: "env-client",
          restApiUrl: "https://api.env.example.com",
        },
        { url: "other.example.com", connectionMethod: "token" },
      ]);
    });

    it("omits empty clientId/apiUrl and the subdomain flag on the default domain", () => {
      setRuntimeConfig({ domain: "env.example.com" });

      const [domain] = getDomainFromStorage();
      expect(domain).toEqual({
        url: "env.example.com",
        connectionMethod: "login",
        clientId: undefined,
        restApiUrl: undefined,
      });
      expect(domain).not.toHaveProperty("useTenantSubdomains");
    });

    it("merges the configured default into a matching stored entry, env winning", () => {
      storeRaw([
        { url: "first.example.com", connectionMethod: "token" },
        {
          url: "https://env.example.com",
          connectionMethod: "client_credentials",
          clientId: "stored-client",
          clientSecret: "stored-secret",
          useTenantSubdomains: true,
        },
      ]);
      setRuntimeConfig({ domain: "env.example.com", clientId: "env-client" });

      const domains = getDomainFromStorage();

      expect(domains).toHaveLength(2);
      expect(domains[0]?.url).toBe("first.example.com");
      expect(domains[1]).toEqual({
        url: "env.example.com",
        connectionMethod: "login",
        clientId: "env-client",
        restApiUrl: undefined,
        clientSecret: "stored-secret",
        // Not set by env, so the stored flag survives the merge.
        useTenantSubdomains: true,
      });
    });

    it("enables tenant subdomains on the default domain when configured", () => {
      setRuntimeConfig({
        domain: "env.example.com",
        useTenantSubdomains: "true",
      });

      expect(getDomainFromStorage()[0]?.useTenantSubdomains).toBe(true);
    });

    it("falls back to the configured default when storage holds malformed JSON", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      localStorage.setItem(DOMAINS_STORAGE_KEY, "{not json");

      expect(getDomainFromStorage()).toEqual([]);

      setRuntimeConfig({ domain: "env.example.com" });
      expect(getDomainFromStorage()).toEqual([
        {
          url: "env.example.com",
          connectionMethod: "login",
          clientId: undefined,
          restApiUrl: undefined,
        },
      ]);
    });
  });

  describe("saveDomainToStorage", () => {
    it("round-trips through getDomainFromStorage", () => {
      const domains = [
        {
          url: "auth.example.com",
          connectionMethod: "login" as const,
          clientId: "abc",
        },
      ];

      saveDomainToStorage(domains);

      expect(
        JSON.parse(localStorage.getItem(DOMAINS_STORAGE_KEY) ?? ""),
      ).toEqual(domains);
      expect(getDomainFromStorage()).toEqual(domains);
    });
  });

  describe("getSelectedDomainFromStorage", () => {
    it("returns the saved selection", () => {
      storeRaw([{ url: "first.example.com", connectionMethod: "login" }]);
      saveSelectedDomainToStorage("second.example.com");

      expect(localStorage.getItem(SELECTED_DOMAIN_STORAGE_KEY)).toBe(
        "second.example.com",
      );
      expect(getSelectedDomainFromStorage()).toBe("second.example.com");
    });

    it("falls back to the first stored domain", () => {
      storeRaw([
        { url: "first.example.com", connectionMethod: "login" },
        { url: "second.example.com", connectionMethod: "login" },
      ]);

      expect(getSelectedDomainFromStorage()).toBe("first.example.com");
    });

    it("prefers the configured default domain as the fallback", () => {
      storeRaw([{ url: "first.example.com", connectionMethod: "login" }]);
      setRuntimeConfig({ domain: "env.example.com" });

      expect(getSelectedDomainFromStorage()).toBe("env.example.com");
    });

    it("returns an empty string when there is nothing to select", () => {
      expect(getSelectedDomainFromStorage()).toBe("");
    });
  });

  describe("getClientIdFromStorage", () => {
    it("returns the client id of the matching stored domain", () => {
      storeRaw([
        {
          url: "other.example.com",
          connectionMethod: "login",
          clientId: "other",
        },
        { url: "auth.example.com", connectionMethod: "login", clientId: "abc" },
      ]);

      expect(getClientIdFromStorage("auth.example.com")).toBe("abc");
    });

    it("matches a domain passed with a protocol", () => {
      storeRaw([
        { url: "auth.example.com", connectionMethod: "login", clientId: "abc" },
      ]);

      expect(getClientIdFromStorage("https://auth.example.com")).toBe("abc");
    });

    it("falls back to the configured client id when there is no match", () => {
      storeRaw([
        { url: "auth.example.com", connectionMethod: "login", clientId: "abc" },
      ]);
      setRuntimeConfig({ clientId: "env-client" });

      expect(getClientIdFromStorage("unknown.example.com")).toBe("env-client");
    });

    it("falls back to the configured client id when the match has none", () => {
      storeRaw(["legacy.example.com"]);
      setRuntimeConfig({ clientId: "env-client" });

      expect(getClientIdFromStorage("legacy.example.com")).toBe("env-client");
    });
  });
});

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
    expect(deriveTenantSubdomainUrl("https://[::1]:3000", "kvartal")).toBe(
      null,
    );
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
