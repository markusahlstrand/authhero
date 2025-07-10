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
      },
      env: {
        data: {
          customDomains: {
            getByDomain: mockGetByDomain,
          },
          tenants: {
            get: mockGet,
          },
        },
        ISSUER: "https://example.com",
      },
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

  it("should set tenant_id from host subdomain when it matches a tenant ID", async () => {
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
