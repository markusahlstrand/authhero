import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validatePasswordPolicy,
  getPasswordPolicy,
} from "../../src/helpers/password-policy";
import { Bindings } from "../../src/types";

describe("password-policy helper", () => {
  let mockData: Bindings["data"];

  beforeEach(() => {
    mockData = {
      passwords: {
        list: vi.fn(),
      },
      connections: {
        get: vi.fn(),
      },
    } as any;
  });

  describe("validatePasswordPolicy", () => {
    it("should throw on short password", async () => {
      const policy = { password_complexity_options: { min_length: 8 } };
      await expect(
        validatePasswordPolicy(policy, {
          newPassword: "short",
          tenantId: "tenant1",
          userId: "user1",
          data: mockData,
        }),
      ).rejects.toThrow("Password must be at least 8 characters");
    });

    it("should throw on weak password for good policy", async () => {
      const policy = { passwordPolicy: "good" };
      await expect(
        validatePasswordPolicy(policy, {
          newPassword: "weak",
          tenantId: "tenant1",
          userId: "user1",
          data: mockData,
        }),
      ).rejects.toThrow("Password must contain at least one uppercase letter");
    });

    it("should throw on reused password", async () => {
      const policy = { password_history: { enable: true, size: 5 } };
      mockData.passwords.list = vi
        .fn()
        .mockResolvedValue([
          {
            password: await import("bcryptjs").then((b) =>
              b.hash("oldpass", 10),
            ),
          },
        ]);
      await expect(
        validatePasswordPolicy(policy, {
          newPassword: "oldpass",
          tenantId: "tenant1",
          userId: "user1",
          data: mockData,
        }),
      ).rejects.toThrow("Password was used recently and cannot be reused");
    });

    it("should throw on personal info", async () => {
      const policy = { password_no_personal_info: { enable: true } };
      await expect(
        validatePasswordPolicy(policy, {
          newPassword: "test@example.com",
          tenantId: "tenant1",
          userId: "user1",
          userData: { email: "test@example.com" },
          data: mockData,
        }),
      ).rejects.toThrow("Password cannot contain personal information");
    });

    it("should throw on dictionary word", async () => {
      const policy = {
        password_dictionary: { enable: true, dictionary: ["password"] },
      };
      await expect(
        validatePasswordPolicy(policy, {
          newPassword: "mypassword",
          tenantId: "tenant1",
          userId: "user1",
          data: mockData,
        }),
      ).rejects.toThrow("Password contains a forbidden word");
    });

    it("should pass valid password", async () => {
      const policy = { password_complexity_options: { min_length: 8 } };
      await expect(
        validatePasswordPolicy(policy, {
          newPassword: "validpassword",
          tenantId: "tenant1",
          userId: "user1",
          data: mockData,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("getPasswordPolicy", () => {
    it("should return connection options", async () => {
      mockData.connections.get = vi
        .fn()
        .mockResolvedValue({ options: { passwordPolicy: "good" } });
      const policy = await getPasswordPolicy(
        mockData,
        "tenant1",
        "connection1",
      );
      expect(policy).toEqual({ passwordPolicy: "good" });
    });

    it("should return empty object if no connection", async () => {
      mockData.connections.get = vi.fn().mockResolvedValue(null);
      const policy = await getPasswordPolicy(
        mockData,
        "tenant1",
        "connection1",
      );
      expect(policy).toEqual({});
    });
  });
});
