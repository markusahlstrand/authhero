import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createAuthMiddleware } from "../../src/middlewares/authentication";
import { createToken, getCertificate } from "../helpers/token";
import { MANAGEMENT_API_AUDIENCE } from "../../src/middlewares/authentication";
import { Bindings, Variables } from "../../src/types";
import * as x509 from "@peculiar/x509";

// Mock JWKS service
const mockJwksService = {
  fetch: vi.fn(),
};

const mockEnv: Bindings = {
  JWKS_SERVICE: mockJwksService,
  JWKS_URL: "https://example.com/.well-known/jwks.json",
} as any;

describe("createAuthMiddleware", () => {
  let app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>;
  let mockCtx: any;
  let mockNext: any;
  let authMiddleware: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();
    authMiddleware = createAuthMiddleware(app);

    mockNext = vi.fn().mockResolvedValue("next-response");

    mockCtx = {
      req: {
        method: "GET",
        matchedRoutes: [
          {
            method: "GET",
            path: "/api/users",
          },
        ],
        header: vi.fn(),
      },
      env: mockEnv,
      set: vi.fn(),
      var: {},
    };

    // Get the actual certificate used by createToken and extract JWK from it
    const certificate = await getCertificate();

    // Parse the PEM certificate to extract the public key
    const cert = new x509.X509Certificate(certificate.cert);
    const publicKey = await cert.publicKey.export();
    const jwkKey = (await crypto.subtle.exportKey(
      "jwk",
      publicKey,
    )) as JsonWebKey;

    mockJwksService.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          keys: [
            {
              alg: "RS256",
              kty: "RSA",
              use: "sig",
              n: jwkKey.n,
              e: jwkKey.e,
              kid: certificate.kid,
              x5t: certificate.thumbprint,
              x5c: [
                certificate.cert.replace(
                  /-----BEGIN CERTIFICATE-----|\r\n|\n|-----END CERTIFICATE-----/g,
                  "",
                ),
              ],
            },
          ],
        }),
    });
  });

  describe("when route has no security requirements", () => {
    beforeEach(() => {
      // Register a route without security requirements
      app.openapi(
        {
          method: "get",
          path: "/api/users",
          responses: {
            200: {
              description: "Success",
            },
          },
        },
        async (c) => c.json({ message: "success" }),
      );
    });

    it("should allow access without authentication", async () => {
      mockCtx.req.header.mockReturnValue(undefined);

      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });
  });

  describe("when route requires Bearer authentication", () => {
    beforeEach(() => {
      // Register a route with Bearer security requirement
      app.openapi(
        {
          method: "get",
          path: "/api/users",
          security: [{ Bearer: ["read:users"] }],
          responses: {
            200: {
              description: "Success",
            },
          },
        },
        async (c) => c.json({ message: "success" }),
      );
    });

    it("should reject request without authorization header", async () => {
      mockCtx.req.header.mockReturnValue(undefined);

      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        HTTPException,
      );
      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        "Missing bearer token",
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject request with invalid authorization header format", async () => {
      mockCtx.req.header.mockReturnValue("InvalidFormat");

      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        HTTPException,
      );
      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        "Missing bearer token",
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject request with non-bearer token", async () => {
      mockCtx.req.header.mockReturnValue("Basic dGVzdDp0ZXN0");

      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        HTTPException,
      );
      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        "Missing bearer token",
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject request when user lacks required permissions", async () => {
      const token = await createToken({
        userId: "user123",
        permissions: ["read:posts"], // Different permission than required
        scope: "openid email",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        HTTPException,
      );
      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        "Unauthorized",
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject request when user lacks required scopes", async () => {
      const token = await createToken({
        userId: "user123",
        permissions: [],
        scope: "openid email", // Missing read:users scope
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        HTTPException,
      );
      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        "Unauthorized",
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should allow request when user has required permissions", async () => {
      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"], // Matching required permission
        scope: "openid email",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockCtx.set).toHaveBeenCalledWith("user_id", "user123");
      expect(mockCtx.set).toHaveBeenCalledWith(
        "user",
        expect.objectContaining({
          sub: "user123",
          permissions: ["read:users"],
        }),
      );
      expect(result).toBe("next-response");
    });

    it("should allow request when user has required scopes", async () => {
      const token = await createToken({
        userId: "user123",
        permissions: [],
        scope: "openid email read:users", // Including required scope
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockCtx.set).toHaveBeenCalledWith("user_id", "user123");
      expect(mockCtx.set).toHaveBeenCalledWith(
        "user",
        expect.objectContaining({
          sub: "user123",
          scope: "openid email read:users",
        }),
      );
      expect(result).toBe("next-response");
    });

    it("should allow request when token uses reversed scope form", async () => {
      const token = await createToken({
        userId: "user123",
        permissions: ["users:read"],
        scope: "openid email",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });

    it("should allow request when token scope claim uses reversed form", async () => {
      const token = await createToken({
        userId: "user123",
        permissions: [],
        scope: "openid email users:read",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });

    it("should allow request when user has additional permissions", async () => {
      const token = await createToken({
        userId: "user123",
        permissions: ["read:users", "write:users", "admin"], // More than required
        scope: "openid email",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockCtx.set).toHaveBeenCalledWith("user_id", "user123");
      expect(result).toBe("next-response");
    });
  });

  describe("when route requires multiple permissions", () => {
    beforeEach(() => {
      // Register a route with multiple required permissions
      app.openapi(
        {
          method: "post",
          path: "/api/users",
          security: [{ Bearer: ["read:users", "write:users"] }],
          responses: {
            200: {
              description: "Success",
            },
          },
        },
        async (c) => c.json({ message: "success" }),
      );

      mockCtx.req.method = "POST";
      mockCtx.req.matchedRoutes = [
        {
          method: "POST",
          path: "/api/users",
        },
      ];
    });

    it("should allow when user has any one of the required permissions", async () => {
      // Note: The current implementation uses `some()` which means ANY of the permissions is sufficient
      const token = await createToken({
        userId: "user123",
        permissions: ["write:users"], // Has one of the required permissions
        scope: "openid email",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });
  });

  describe("when no matched route is found", () => {
    beforeEach(() => {
      mockCtx.req.matchedRoutes = [];
    });

    it("should allow access without authentication", async () => {
      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });
  });

  describe("when route is not in OpenAPI registry", () => {
    beforeEach(() => {
      // Don't register any routes, so the middleware can't find the definition
      mockCtx.req.matchedRoutes = [
        {
          method: "GET",
          path: "/api/unknown",
        },
      ];
    });

    it("should allow access without authentication", async () => {
      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });
  });

  describe("JWKS service failures", () => {
    beforeEach(() => {
      app.openapi(
        {
          method: "get",
          path: "/api/users",
          security: [{ Bearer: ["read:users"] }],
          responses: {
            200: {
              description: "Success",
            },
          },
        },
        async (c) => c.json({ message: "success" }),
      );
    });

    it("should reject when JWKS service is unavailable", async () => {
      mockJwksService.fetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        HTTPException,
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should reject when JWKS service throws an error", async () => {
      mockJwksService.fetch.mockRejectedValue(new Error("Network error"));

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      await expect(authMiddleware(mockCtx, mockNext)).rejects.toThrow(
        HTTPException,
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // The management-audience check is opt-in via
  // `requireManagementAudience: true`. The default must remain off so that
  // auth-api routes like /userinfo accept normal user access tokens. These
  // tests pin both directions of the option.
  describe("requireManagementAudience option", () => {
    beforeEach(() => {
      app.openapi(
        {
          method: "get",
          path: "/api/users",
          security: [{ Bearer: ["read:users"] }],
          responses: {
            200: {
              description: "Success",
            },
          },
        },
        async (c) => c.json({ message: "success" }),
      );
    });

    it("accepts a non-management audience by default", async () => {
      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: "https://example.com/api",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await authMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });

    it("rejects a non-management audience when requireManagementAudience is true", async () => {
      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: "https://example.com/api",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      await expect(strictMiddleware(mockCtx, mockNext)).rejects.toThrow(
        "Invalid audience",
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("accepts the management audience when requireManagementAudience is true", async () => {
      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: MANAGEMENT_API_AUDIENCE,
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await strictMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });
  });

  // Cross-tenant access via `tenant-id` header: the management API resolves
  // tenant from the header (tenantMiddleware runs first). Without this guard
  // any admin token from any tenant could be used to manage any other tenant
  // by setting `tenant-id`. The auth middleware enforces that mismatched
  // request/token tenant_ids are only allowed when the token comes from the
  // configured control-plane tenant.
  describe("cross-tenant management guard", () => {
    beforeEach(() => {
      app.openapi(
        {
          method: "get",
          path: "/users",
          security: [{ Bearer: ["read:users"] }],
          responses: { 200: { description: "Success" } },
        },
        async (c) => c.json({ message: "success" }),
      );
      mockCtx.req.matchedRoutes = [{ method: "GET", path: "/api/v2/users" }];
    });

    it("rejects when the token's tenant_id does not match the request tenant_id (no control plane configured)", async () => {
      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: MANAGEMENT_API_AUDIENCE,
        tenantId: "tenantA",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);
      // Simulate tenantMiddleware having already set tenant_id from the
      // request header.
      mockCtx.var.tenant_id = "tenantB";

      await expect(strictMiddleware(mockCtx, mockNext)).rejects.toThrow(
        /Cross-tenant management/i,
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("allows the same tenant in token and request", async () => {
      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: MANAGEMENT_API_AUDIENCE,
        tenantId: "tenantA",
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);
      mockCtx.var.tenant_id = "tenantA";

      const result = await strictMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });

    it("allows cross-tenant when the token is from the configured control plane", async () => {
      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: MANAGEMENT_API_AUDIENCE,
        tenantId: "controlPlane",
      });

      // Wire the control-plane tenant id into the mock env.
      mockCtx.env = {
        ...mockEnv,
        data: { multiTenancyConfig: { controlPlaneTenantId: "controlPlane" } },
      };
      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);
      mockCtx.var.tenant_id = "tenantB";

      const result = await strictMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });

    it("rejects when token tenant differs from request tenant and is not the control plane", async () => {
      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: MANAGEMENT_API_AUDIENCE,
        tenantId: "tenantA",
      });

      mockCtx.env = {
        ...mockEnv,
        data: { multiTenancyConfig: { controlPlaneTenantId: "controlPlane" } },
      };
      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);
      mockCtx.var.tenant_id = "tenantB";

      await expect(strictMiddleware(mockCtx, mockNext)).rejects.toThrow(
        /Cross-tenant management/i,
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("does not enforce the cross-tenant rule when the token has no tenant_id claim", async () => {
      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: MANAGEMENT_API_AUDIENCE,
        // no tenantId — token is not tenant-scoped (e.g. legacy)
      });

      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);
      mockCtx.var.tenant_id = "tenantB";

      const result = await strictMiddleware(mockCtx, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });
  });

  // The previous `AUDIENCE_EXEMPT_PREFIXES` carve-out for `/api/v2/users*`
  // and `/api/v2/users-by-email*` was a temporary migration aid for external
  // callers issuing tokens with the legacy audience. It has been removed —
  // all management-API routes now require `urn:authhero:management` in `aud`.
  // Note: middleware strips /api/v2 before looking up the route in the
  // OpenAPI registry, so we register routes here with their relative paths
  // (e.g. /users) while matchedRoutes carries the full /api/v2/... path.
  describe("audience enforcement on /api/v2/users* paths (no exemption)", () => {
    const userPaths: Array<{ full: string; relative: string }> = [
      { full: "/api/v2/users", relative: "/users" },
      { full: "/api/v2/users/", relative: "/users/" },
      { full: "/api/v2/users/{user_id}", relative: "/users/{user_id}" },
      {
        full: "/api/v2/users/{user_id}/identities",
        relative: "/users/{user_id}/identities",
      },
      { full: "/api/v2/users-by-email", relative: "/users-by-email" },
      { full: "/api/v2/users-by-email/", relative: "/users-by-email/" },
    ];

    for (const { full, relative } of userPaths) {
      it(`rejects a non-management audience on ${full}`, async () => {
        app.openapi(
          {
            method: "get",
            path: relative,
            security: [{ Bearer: ["read:users"] }],
            responses: { 200: { description: "Success" } },
          },
          async (c) => c.json({ message: "success" }),
        );

        const strictMiddleware = createAuthMiddleware(app, {
          requireManagementAudience: true,
        });

        const token = await createToken({
          userId: "user123",
          permissions: ["read:users"],
          aud: "https://example.com/api",
        });

        mockCtx.req.matchedRoutes = [{ method: "GET", path: full }];
        mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

        await expect(strictMiddleware(mockCtx, mockNext)).rejects.toThrow(
          "Invalid audience",
        );
        expect(mockNext).not.toHaveBeenCalled();
      });
    }

    it("accepts the management audience on /api/v2/users", async () => {
      app.openapi(
        {
          method: "get",
          path: "/users",
          security: [{ Bearer: ["read:users"] }],
          responses: { 200: { description: "Success" } },
        },
        async (c) => c.json({ message: "success" }),
      );

      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: MANAGEMENT_API_AUDIENCE,
      });

      mockCtx.req.matchedRoutes = [{ method: "GET", path: "/api/v2/users" }];
      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      const result = await strictMiddleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe("next-response");
    });

    it("does not exempt sibling paths like /api/v2/userinfo", async () => {
      app.openapi(
        {
          method: "get",
          path: "/userinfo",
          security: [{ Bearer: ["read:users"] }],
          responses: { 200: { description: "Success" } },
        },
        async (c) => c.json({ message: "success" }),
      );

      const strictMiddleware = createAuthMiddleware(app, {
        requireManagementAudience: true,
      });

      const token = await createToken({
        userId: "user123",
        permissions: ["read:users"],
        aud: "https://example.com/api",
      });

      mockCtx.req.matchedRoutes = [{ method: "GET", path: "/api/v2/userinfo" }];
      mockCtx.req.header.mockReturnValue(`Bearer ${token}`);

      await expect(strictMiddleware(mockCtx, mockNext)).rejects.toThrow(
        "Invalid audience",
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
