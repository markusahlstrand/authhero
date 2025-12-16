import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("passwords", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("should create and retrieve a password", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const user = await data.users.create("tenantId", {
      user_id: "email|user1",
      email: "user1@example.com",
      name: "User One",
      email_verified: true,
      is_social: false,
      connection: "Username-Password-Authentication",
      provider: "authhero",
    });

    // ----------------------------------------
    // Create
    // ----------------------------------------
    const created = await data.passwords.create("tenantId", {
      user_id: user.user_id,
      password: "$2a$10$hashedpassword123",
      algorithm: "bcrypt",
      is_current: true,
    });

    expect(created.user_id).toBe(user.user_id);
    expect(created.password).toBe("$2a$10$hashedpassword123");
    expect(created.algorithm).toBe("bcrypt");
    expect(created.created_at).toBeDefined();

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const fetched = await data.passwords.get("tenantId", user.user_id);
    expect(fetched).not.toBeNull();
    expect(fetched?.password).toBe("$2a$10$hashedpassword123");
  });

  it("should return null for user without password", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const result = await data.passwords.get("tenantId", "non-existent-user");
    expect(result).toBeNull();
  });

  it("should update password", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const user = await data.users.create("tenantId", {
      user_id: "email|updatepw",
      email: "updatepw@example.com",
      name: "Update Password User",
      email_verified: true,
      is_social: false,
      connection: "Username-Password-Authentication",
      provider: "authhero",
    });

    await data.passwords.create("tenantId", {
      user_id: user.user_id,
      password: "$2a$10$originalpassword",
      algorithm: "bcrypt",
      is_current: true,
    });

    // Update password
    const updated = await data.passwords.update("tenantId", {
      user_id: user.user_id,
      password: "$2a$10$newpassword",
      algorithm: "bcrypt",
      is_current: true,
    });
    expect(updated).toBe(true);

    // Verify update
    const fetched = await data.passwords.get("tenantId", user.user_id);
    expect(fetched?.password).toBe("$2a$10$newpassword");
  });
});
