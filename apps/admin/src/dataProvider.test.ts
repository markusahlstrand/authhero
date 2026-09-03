// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DataProvider } from "ra-core";
import { DOMAINS_STORAGE_KEY, type DomainConfig } from "./utils/domainUtils";

// `dataProvider` composes the Auth0 provider with lifecycle callbacks; both of
// its collaborators reach for browser auth state, so stub them out and assert
// on what the composition hands down.
const { auth0DataProviderFactory, updateSpy } = vi.hoisted(() => {
  const updateSpy = vi.fn(
    async (_resource: string, _params: { data: Record<string, unknown> }) => ({
      data: { id: "tenant-1" },
    }),
  );
  return {
    updateSpy,
    auth0DataProviderFactory: vi.fn((..._args: unknown[]) => ({
      getList: vi.fn(),
      getOne: vi.fn(),
      getMany: vi.fn(),
      getManyReference: vi.fn(),
      create: vi.fn(),
      update: updateSpy,
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    })),
  };
});

vi.mock("./auth0DataProvider", () => ({ default: auth0DataProviderFactory }));

vi.mock("./authProvider", () => ({
  authorizedHttpClient: vi.fn(),
  createOrganizationHttpClient: vi.fn(() => vi.fn()),
  isSingleTenantForDomain: vi.fn(() => false),
}));

import {
  resolveApiBase,
  resolveTenantApiBase,
  getDataprovider,
  getDataproviderForTenant,
} from "./dataProvider";

function storeDomains(domains: DomainConfig[]) {
  localStorage.setItem(DOMAINS_STORAGE_KEY, JSON.stringify(domains));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Pin the runtime config so the env-derived default domain doesn't leak in.
  window.__AUTHHERO_ADMIN_CONFIG__ = {
    domain: "",
    clientId: "",
    apiUrl: "https://api.default.com",
  };
});

describe("resolveApiBase", () => {
  it("falls back to the configured apiUrl when no domain is given", () => {
    expect(resolveApiBase()).toBe("https://api.default.com");
  });

  it("returns an empty string when nothing is configured", () => {
    window.__AUTHHERO_ADMIN_CONFIG__ = { domain: "", clientId: "", apiUrl: "" };
    expect(resolveApiBase()).toBe("");
  });

  it("prefers the stored restApiUrl for the domain", () => {
    storeDomains([
      {
        url: "auth.example.com",
        connectionMethod: "login",
        restApiUrl: "api.example.com",
      },
    ]);
    expect(resolveApiBase("auth.example.com")).toBe("https://api.example.com");
  });

  it("matches the stored config regardless of scheme on either side", () => {
    storeDomains([
      {
        url: "https://auth.example.com",
        connectionMethod: "login",
        restApiUrl: "api.example.com",
      },
    ]);
    expect(resolveApiBase("https://auth.example.com")).toBe(
      "https://api.example.com",
    );
  });

  it("uses the domain itself when it has no stored restApiUrl", () => {
    storeDomains([{ url: "auth.example.com", connectionMethod: "login" }]);
    expect(resolveApiBase("auth.example.com")).toBe("https://auth.example.com");
    // Unknown domains behave the same way.
    expect(resolveApiBase("other.example.com")).toBe(
      "https://other.example.com",
    );
  });
});

describe("resolveTenantApiBase", () => {
  it("returns the apex base when there is no domain to look up", () => {
    expect(resolveTenantApiBase("kvartal")).toBe("https://api.default.com");
  });

  it("stays on the apex when the domain has not opted into subdomains", () => {
    storeDomains([
      {
        url: "auth.example.com",
        connectionMethod: "login",
        restApiUrl: "api.example.com",
      },
    ]);
    expect(resolveTenantApiBase("kvartal", "auth.example.com")).toBe(
      "https://api.example.com",
    );
  });

  it("prefixes the tenant id as a subdomain when the domain opts in", () => {
    storeDomains([
      {
        url: "auth.example.com",
        connectionMethod: "login",
        restApiUrl: "api.example.com",
        useTenantSubdomains: true,
      },
    ]);
    expect(resolveTenantApiBase("kvartal", "auth.example.com")).toBe(
      "https://kvartal.api.example.com/",
    );
  });

  it("falls back to the apex for hosts that cannot take a subdomain", () => {
    storeDomains([
      {
        url: "auth.example.com",
        connectionMethod: "login",
        restApiUrl: "http://localhost:3000",
        useTenantSubdomains: true,
      },
    ]);
    // Loopback keeps the `tenant-id` header addressing instead.
    expect(resolveTenantApiBase("kvartal", "auth.example.com")).toBe(
      "http://localhost:3000",
    );
  });
});

describe("getDataproviderForTenant", () => {
  it("passes the resolved tenant base url, tenant id and domain down", () => {
    storeDomains([
      {
        url: "auth.example.com",
        connectionMethod: "login",
        restApiUrl: "api.example.com",
        useTenantSubdomains: true,
      },
    ]);

    getDataproviderForTenant("kvartal", "auth.example.com");

    const [apiUrl, , tenantId, domain] = auth0DataProviderFactory.mock.calls[0];
    // The trailing slash from URL serialisation must not survive — every call
    // site appends `/api/v2/...`.
    expect(apiUrl).toBe("https://kvartal.api.example.com");
    expect(tenantId).toBe("kvartal");
    expect(domain).toBe("auth.example.com");
  });
});

describe("getDataprovider", () => {
  it("strips server-owned and undefined fields before updating a tenant", async () => {
    const provider = getDataprovider("auth.example.com") as DataProvider;

    await provider.update("tenants", {
      id: "tenant-1",
      previousData: { id: "tenant-1" },
      data: {
        id: "tenant-1",
        tenant_id: "tenant-1",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
        name: "Kvartal",
        support_email: undefined,
        // null is left alone: it is how a PATCH clears a field.
        logo: null,
      },
    });

    expect(updateSpy.mock.calls[0][1].data).toEqual({
      name: "Kvartal",
      logo: null,
    });
  });

  it("leaves other resources untouched by the tenants callback", async () => {
    const provider = getDataprovider("auth.example.com") as DataProvider;

    await provider.update("clients", {
      id: "client-1",
      previousData: { id: "client-1" },
      data: { id: "client-1", tenant_id: "tenant-1", name: "App" },
    });

    expect(updateSpy.mock.calls[0][1].data).toEqual({
      id: "client-1",
      tenant_id: "tenant-1",
      name: "App",
    });
  });
});
