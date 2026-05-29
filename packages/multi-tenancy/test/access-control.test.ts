import { describe, it, expect } from "vitest";
import {
  createAccessControlHooks,
  validateTenantAccess,
} from "../src/hooks/access-control";

describe("Access Control", () => {
  describe("createAccessControlHooks", () => {
    it("should allow access to control plane without org claim", async () => {
      const hooks = createAccessControlHooks({
        controlPlaneTenantId: "control-plane",
      });

      const ctx = {
        var: {},
      } as any;

      const result = await hooks.onTenantAccessValidation(ctx, "control-plane");
      expect(result).toBe(true);
    });

    it("should deny access to child tenant without org claim", async () => {
      const hooks = createAccessControlHooks({
        controlPlaneTenantId: "control-plane",
      });

      const ctx = {
        var: {},
      } as any;

      const result = await hooks.onTenantAccessValidation(ctx, "child-tenant");
      expect(result).toBe(false);
    });

    it("should allow case-insensitive access with lowercase org_name", async () => {
      const hooks = createAccessControlHooks({
        controlPlaneTenantId: "control-plane",
      });

      const ctx = {
        var: {
          org_name: "my-tenant",
        },
      } as any;

      const result = await hooks.onTenantAccessValidation(ctx, "my-tenant");
      expect(result).toBe(true);
    });

    it("should allow case-insensitive access with uppercase org_name", async () => {
      const hooks = createAccessControlHooks({
        controlPlaneTenantId: "control-plane",
      });

      // Token has uppercase org_name (legacy)
      const ctx = {
        var: {
          org_name: "MY-TENANT",
        },
      } as any;

      // Tenant ID is lowercase
      const result = await hooks.onTenantAccessValidation(ctx, "my-tenant");
      expect(result).toBe(true);
    });

    it("should allow case-insensitive access with mixed case", async () => {
      const hooks = createAccessControlHooks({
        controlPlaneTenantId: "control-plane",
      });

      // Token has lowercase org_name (new format)
      const ctx = {
        var: {
          org_name: "default_settings",
        },
      } as any;

      // Tenant ID might have uppercase (legacy)
      const result = await hooks.onTenantAccessValidation(
        ctx,
        "DEFAULT_SETTINGS",
      );
      expect(result).toBe(true);
    });

    it("should allow access with organization_id fallback (case-insensitive)", async () => {
      const hooks = createAccessControlHooks({
        controlPlaneTenantId: "control-plane",
      });

      const ctx = {
        var: {
          organization_id: "MY-ORG",
        },
      } as any;

      const result = await hooks.onTenantAccessValidation(ctx, "my-org");
      expect(result).toBe(true);
    });
  });

  describe("validateTenantAccess", () => {
    it("should allow access to control plane", () => {
      const result = validateTenantAccess(
        undefined,
        "control-plane",
        "control-plane",
      );
      expect(result).toBe(true);
    });

    it("should deny access without org claim", () => {
      const result = validateTenantAccess(
        undefined,
        "child-tenant",
        "control-plane",
      );
      expect(result).toBe(false);
    });

    it("should allow case-insensitive access", () => {
      const result = validateTenantAccess(
        "MY-TENANT",
        "my-tenant",
        "control-plane",
      );
      expect(result).toBe(true);
    });

    it("should use org_name when provided (case-insensitive)", () => {
      const result = validateTenantAccess(
        "org_123", // organization_id
        "my-tenant", // targetTenantId
        "control-plane",
        "MY-TENANT", // org_name takes precedence
      );
      expect(result).toBe(true);
    });
  });
});
