import { describe, expect, it, vi, beforeEach } from "vitest";
import { tenantMiddleware } from "../../src/middlewares/tenant";

describe("tenantMiddleware", () => {
  let mockCtx;
  let mockNext;
  let mockSet;
  let mockGetByDomain;
  let mockGet;
  let mockList;
  let mockHeaderFn;

  beforeEach(() => {
    mockGetByDomain = vi.fn();
    mockGet = vi.fn();
    mockList = vi.fn().mockResolvedValue({ tenants: [] });
    mockSet = vi.fn();
    mockNext = vi.fn().mockResolvedValue(null);
    mockHeaderFn = vi.fn();

    mockCtx = {
      req: {
        header: mockHeaderFn,
        query: vi.fn().mockReturnValue(undefined),
        path: "/authorize",
      },
      env: {
        data: {
          customDomains: {
            getByDomain: mockGetByDomain,
          },
          tenants: {
            get: mockGet,
            list: mockList,
          },
        },
        ISSUER: "https://example.com",
      },
      var: {},
      set: mockSet,
    };
  });

  it("should set tenant_id from x-forwarded-host when domain exists", async () => {
    // Arrange
    const domain = "custom-domain.com";
    const tenant_id = "tenant123";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return domain;
      return null;
    });

    mockGetByDomain.mockResolvedValue({ tenant_id });

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert
    expect(mockHeaderFn).toHaveBeenCalledWith("x-forwarded-host");
    expect(mockGetByDomain).toHaveBeenCalledWith(domain);
    expect(mockSet).toHaveBeenCalledWith("tenant_id", tenant_id);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should set tenant_id from host header when it matches a registered custom domain", async () => {
    // Arrange
    const host = "login.fokus.se";
    const tenant_id = "tenant123";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGetByDomain.mockResolvedValue({ tenant_id });

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert
    expect(mockHeaderFn).toHaveBeenCalledWith("x-forwarded-host");
    expect(mockHeaderFn).toHaveBeenCalledWith("host");
    expect(mockGetByDomain).toHaveBeenCalledWith(host);
    expect(mockSet).toHaveBeenCalledWith("tenant_id", tenant_id);
    expect(mockSet).toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should lowercase host for custom-domain lookup but preserve original casing in custom_domain", async () => {
    // Arrange — RFC 3986 §3.2.2: host is case-insensitive, but we keep
    // the request's original casing in ctx.var.custom_domain.
    const host = "Login.Fokus.Se";
    const tenant_id = "tenant123";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGetByDomain.mockResolvedValue({ tenant_id });

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert
    expect(mockGetByDomain).toHaveBeenCalledWith("login.fokus.se");
    expect(mockSet).toHaveBeenCalledWith("tenant_id", tenant_id);
    expect(mockSet).toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should resolve the subdomain of the ISSUER apex as tenant_id when the tenant exists", async () => {
    // Arrange — `{tenant_id}.{issuerHost}` carries the tenant id in the host
    // itself; we verify the tenant exists (one indexed read) before trusting it.
    const host = "tenant123.example.com";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGet.mockResolvedValue({ id: "tenant123" });

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert — only the tenant existence check, no custom-domain probe / list
    expect(mockGetByDomain).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith("tenant123");
    expect(mockList).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith("tenant_id", "tenant123");
    expect(mockSet).toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should 404 when the subdomain of the ISSUER apex is not a real tenant", async () => {
    // A bogus subdomain (e.g. does-not-exist.example.com) must not resolve to
    // a phantom tenant — otherwise the token endpoint would mint a token with
    // iss=https://does-not-exist.example.com/ for a tenant that doesn't exist.
    const host = "does-not-exist.example.com";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGet.mockResolvedValue(undefined);

    await expect(tenantMiddleware(mockCtx, mockNext)).rejects.toMatchObject({
      status: 404,
    });

    expect(mockGet).toHaveBeenCalledWith("does-not-exist");
    expect(mockSet).not.toHaveBeenCalledWith("tenant_id", expect.anything());
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should resolve the subdomain from x-forwarded-host (proxied requests)", async () => {
    const host = "tenant123.auth.example.com";
    mockCtx.env.ISSUER = "https://auth.example.com/";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return host;
      if (header === "host") return "internal-worker.example.workers.dev";
      return null;
    });

    mockGet.mockResolvedValue({ id: "tenant123" });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockGetByDomain).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith("tenant123");
    expect(mockSet).toHaveBeenCalledWith("tenant_id", "tenant123");
    expect(mockSet).toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should lowercase the subdomain tenant_id but preserve host casing in custom_domain", async () => {
    const host = "Tenant123.Example.com";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGet.mockResolvedValue({ id: "tenant123" });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockGet).toHaveBeenCalledWith("tenant123");
    expect(mockSet).toHaveBeenCalledWith("tenant_id", "tenant123");
    expect(mockSet).toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should not derive a tenant from the ISSUER apex host itself", async () => {
    // The apex can never be a tenant subdomain — no probe, fall through to
    // the auto-detect fallback.
    const host = "auth.example.com";
    mockCtx.env.ISSUER = "https://auth.example.com/";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockGetByDomain).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockList).toHaveBeenCalled(); // auto-detect fallback ran
    expect(mockSet).not.toHaveBeenCalledWith("tenant_id", expect.anything());
    expect(mockNext).toHaveBeenCalled();
  });

  it("should treat host vs ISSUER comparison as case-insensitive (RFC 3986)", async () => {
    // Mixed-case apex host must still be recognized as the apex.
    const host = "Auth.Example.com";
    mockCtx.env.ISSUER = "https://auth.example.com/";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockGetByDomain).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalledWith("tenant_id", expect.anything());
    expect(mockSet).not.toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should not treat deeper subdomains of the ISSUER apex as tenants or custom domains", async () => {
    // `a.b.{issuerHost}` is neither a tenant subdomain (multi-label) nor a
    // possible custom domain — no probes, fall through to auto-detect.
    const host = "a.b.auth.example.com";
    mockCtx.env.ISSUER = "https://auth.example.com/";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockGetByDomain).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalledWith("tenant_id", expect.anything());
    expect(mockNext).toHaveBeenCalled();
  });

  it("should not interpret the subdomain of a non-ISSUER host as a tenant id", async () => {
    // Hosts outside the ISSUER apex say nothing about tenant identity —
    // only the (verified) custom-domain lookup applies to them.
    const host = "unknown.authhero.com"; // ISSUER is example.com

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGetByDomain.mockResolvedValue(null);

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockGetByDomain).toHaveBeenCalledWith(host);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalledWith("tenant_id", expect.anything());
    expect(mockNext).toHaveBeenCalled();
  });

  it("should set tenant_id from the tenant_id query param", async () => {
    mockHeaderFn.mockReturnValue(null);
    mockCtx.req.query = vi.fn().mockReturnValue("tenant-from-query");

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockSet).toHaveBeenCalledWith("tenant_id", "tenant-from-query");
    expect(mockList).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it("should auto-detect a single tenant when nothing else resolves", async () => {
    mockHeaderFn.mockReturnValue(null);
    mockList.mockResolvedValue({ tenants: [{ id: "only-tenant" }] });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockList).toHaveBeenCalledWith({ per_page: 2 });
    expect(mockSet).toHaveBeenCalledWith("tenant_id", "only-tenant");
    expect(mockNext).toHaveBeenCalled();
  });

  it("should skip the single-tenant auto-detect on state-keyed routes", async () => {
    // /callback resolves its tenant from the state artifact (code → login
    // session → client) — the tenants.list round-trip is pure cost there.
    mockHeaderFn.mockReturnValue(null);
    mockCtx.req.path = "/callback";
    mockList.mockResolvedValue({ tenants: [{ id: "only-tenant" }] });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockList).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalledWith("tenant_id", expect.anything());
    expect(mockNext).toHaveBeenCalled();
  });

  it("should continue to next middleware when no host headers are present", async () => {
    // Arrange
    mockHeaderFn.mockReturnValue(null);

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert
    expect(mockGetByDomain).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });
});
