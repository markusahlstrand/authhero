import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createAuthMiddleware } from "../../src/middlewares/authentication";
import { createToken, getCertificate } from "../helpers/token";
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
});
