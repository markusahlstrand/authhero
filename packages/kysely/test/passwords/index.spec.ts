import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

// Basic CRUD tests for passwords
describe("passwords", () => {
  it("should support crud operations", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // Create user
    await data.users.create("tenantId", {
      user_id: "email|user1",
      email: "user1@example.com",
      name: "User One",
      email_verified: true,
      is_social: false,
      connection: "Username-Password-Authentication",
      provider: "authhero",
    });

    // ----------------------------------------
    // Create password
    // --------------------------------
    const createdPassword = await data.passwords.create("tenantId", {
      user_id: "email|user1",
      password: "hashedpassword",
      algorithm: "argon2id",
    });

    expect(createdPassword).toMatchObject({
      user_id: "email|user1",
      password: "hashedpassword",
      is_current: true,
    });

    // ----------------------------------------
    // Get current password
    // --------------------------------
    const currentPassword = await data.passwords.get("tenantId", "email|user1");
    expect(currentPassword).toMatchObject({
      user_id: "email|user1",
      password: "hashedpassword",
      is_current: true,
    });

    // ----------------------------------------
    // List passwords
    // --------------------------------
    const allPasswords = await data.passwords.list("tenantId", "email|user1");
    expect(allPasswords).toHaveLength(1);
    expect(allPasswords[0]).toMatchObject({
      user_id: "email|user1",
      password: "hashedpassword",
      is_current: true,
    });

    // ----------------------------------------
    // List with limit
    // --------------------------------
    const limitedPasswords = await data.passwords.list(
      "tenantId",
      "email|user1",
      1,
    );
    expect(limitedPasswords).toHaveLength(1);

    // ----------------------------------------
    // Create another password (simulate change)
    // --------------------------------
    const newPassword = await data.passwords.create("tenantId", {
      user_id: "email|user1",
      password: "newhashedpassword",
      algorithm: "argon2id",
    });

    expect(newPassword.is_current).toBe(true);

    // List should return both, sorted by created_at desc
    const allPasswordsAfter = await data.passwords.list(
      "tenantId",
      "email|user1",
    );
    expect(allPasswordsAfter).toHaveLength(2);
    expect(allPasswordsAfter[0].is_current).toBe(true);
    expect(allPasswordsAfter[1].is_current).toBe(false);
  });
});
