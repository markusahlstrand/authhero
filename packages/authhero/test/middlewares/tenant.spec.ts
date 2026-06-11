import { describe, expect, it, vi, beforeEach } from "vitest";
import { tenantMiddleware } from "../../src/middlewares/tenant";

describe("tenantMiddleware", () => {
  let mockCtx;
  let mockNext;
  let mockSet;
  let mockGetByDomain;
  let mockGet;
  let mockHeaderFn;

  beforeEach(() => {
    mockGetByDomain = vi.fn();
    mockGet = vi.fn();
    mockSet = vi.fn();
    mockNext = vi.fn().mockResolvedValue(null);
    mockHeaderFn = vi.fn();

    mockCtx = {
      req: {
        header: mockHeaderFn,
        query: vi.fn().mockReturnValue(undefined),
      },
      env: {
        data: {
          customDomains: {
            getByDomain: mockGetByDomain,
          },
          tenants: {
            get: mockGet,
            list: vi.fn().mockResolvedValue({ tenants: [] }),
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

    // First call (x-forwarded-host) returns null, second call (host) returns the domain
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

  it("should set tenant_id and custom_domain from host subdomain when it matches a tenant ID", async () => {
    // Arrange
    const host = "tenant123.authhero.com";
    const subdomain = "tenant123";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGetByDomain.mockResolvedValue(null);
    mockGet.mockResolvedValue({ id: subdomain });

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert
    expect(mockHeaderFn).toHaveBeenCalledWith("x-forwarded-host");
    expect(mockHeaderFn).toHaveBeenCalledWith("host");
    expect(mockGet).toHaveBeenCalledWith(subdomain);
    expect(mockSet).toHaveBeenCalledWith("tenant_id", subdomain);
    expect(mockSet).toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should not set custom_domain when subdomain match lands on the canonical ISSUER host", async () => {
    // Arrange
    const host = "auth.example.com";
    const subdomain = "auth";
    mockCtx.env.ISSUER = "https://auth.example.com/";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGetByDomain.mockResolvedValue(null);
    mockGet.mockResolvedValue({ id: subdomain });

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert
    expect(mockSet).toHaveBeenCalledWith("tenant_id", subdomain);
    expect(mockSet).not.toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should treat host vs ISSUER comparison as case-insensitive (RFC 3986)", async () => {
    // Arrange — request lands on the canonical ISSUER host but with mixed-case host header
    const host = "Auth.Example.com";
    const subdomain = "auth";
    mockCtx.env.ISSUER = "https://auth.example.com/";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGetByDomain.mockResolvedValue(null);
    mockGet.mockResolvedValue({ id: subdomain });

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert — must NOT set custom_domain even though host casing differs from ISSUER
    expect(mockSet).toHaveBeenCalledWith("tenant_id", subdomain);
    expect(mockSet).not.toHaveBeenCalledWith("custom_domain", host);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should skip the customDomains lookup when the host is on the ISSUER apex", async () => {
    // Hosts on the canonical ISSUER apex (the issuer host itself, or any
    // subdomain of it) are structurally tenant subdomains, never custom
    // domains. The middleware must skip the customDomains.getByDomain probe
    // to avoid a DB round-trip on every request.
    const host = "tenant123.auth.example.com";
    const subdomain = "tenant123";
    mockCtx.env.ISSUER = "https://auth.example.com/";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGet.mockResolvedValue({ id: subdomain });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockGetByDomain).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith(subdomain);
    expect(mockSet).toHaveBeenCalledWith("tenant_id", subdomain);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should skip the customDomains lookup when x-forwarded-host is on the ISSUER apex", async () => {
    const host = "tenant123.auth.example.com";
    const subdomain = "tenant123";
    mockCtx.env.ISSUER = "https://auth.example.com/";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return host;
      if (header === "host") return host;
      return null;
    });

    mockGet.mockResolvedValue({ id: subdomain });

    await tenantMiddleware(mockCtx, mockNext);

    expect(mockGetByDomain).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it("should not set tenant_id when subdomain does not match a tenant ID", async () => {
    // Arrange
    const host = "unknown.authhero.com";

    mockHeaderFn.mockImplementation((header) => {
      if (header === "x-forwarded-host") return null;
      if (header === "host") return host;
      return null;
    });

    mockGetByDomain.mockResolvedValue(null);
    mockGet.mockResolvedValue(null);

    // Act
    await tenantMiddleware(mockCtx, mockNext);

    // Assert
    expect(mockHeaderFn).toHaveBeenCalledWith("x-forwarded-host");
    expect(mockHeaderFn).toHaveBeenCalledWith("host");
    expect(mockGet).toHaveBeenCalledWith("unknown");
    expect(mockSet).toHaveBeenCalled();
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
