import { describe, expect, it, afterEach } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("users", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("should support crud operations", async () => {
    const { data } = await getTestServer();

    // Create tenant first
    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Create
    // ----------------------------------------
    const createdUser = await data.users.create("tenantId", {
      user_id: "email|user1",
      email: "user1@example.com",
      name: "User One",
      email_verified: true,
      is_social: false,
      app_metadata: { foo: "bar" },
      user_metadata: { hello: "world" },
      connection: "Username-Password-Authentication",
      provider: "authhero",
    });

    expect(createdUser).toMatchObject({
      user_id: "email|user1",
      email: "user1@example.com",
      name: "User One",
      email_verified: true,
      is_social: false,
    });

    // ----------------------------------------
    // Update
    // ----------------------------------------
    const updateResult = await data.users.update("tenantId", "email|user1", {
      name: "User One Updated",
      email_verified: false,
    });
    expect(updateResult).toBe(true);

    // ----------------------------------------
    // Get
    // ----------------------------------------
    const getUser = await data.users.get("tenantId", "email|user1");
    expect(getUser).toMatchObject({
      user_id: "email|user1",
      name: "User One Updated",
      email_verified: false,
    });

    // ----------------------------------------
    // List
    // ----------------------------------------
    const list = await data.users.list("tenantId");
    expect(list.users.length).toBe(1);
    expect(list.users[0]?.email).toBe("user1@example.com");

    // ----------------------------------------
    // Delete
    // ----------------------------------------
    const deleteResult = await data.users.remove("tenantId", "email|user1");
    expect(deleteResult).toBe(true);

    // ----------------------------------------
    // Get with not found
    // ----------------------------------------
    const getUserNotFound = await data.users.get("tenantId", "email|user1");
    expect(getUserNotFound).toBe(null);
  });
});
