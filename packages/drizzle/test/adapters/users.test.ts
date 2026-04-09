import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("users adapter", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;

    // Create a tenant first
    await data.tenants.create({ id: "tenant1", name: "Test Tenant" });
  });

  it("should create and get a user", async () => {
    const user = await data.users.create("tenant1", {
      user_id: "auth0|user1",
      email: "test@example.com",
      email_verified: true,
      is_social: false,
      provider: "auth0",
      connection: "Username-Password-Authentication",
      login_count: 0,
    });

    expect(user.user_id).toBe("auth0|user1");
    expect(user.email).toBe("test@example.com");
    expect(user.email_verified).toBe(true);

    const fetched = await data.users.get("tenant1", "auth0|user1");
    expect(fetched).not.toBeNull();
    expect(fetched!.email).toBe("test@example.com");
    expect(fetched!.identities).toHaveLength(1);
    expect(fetched!.identities[0].isPrimary).toBe(true);
  });

  it("should update a user", async () => {
    await data.users.create("tenant1", {
      user_id: "auth0|user1",
      email: "original@example.com",
      email_verified: false,
      is_social: false,
      provider: "auth0",
      login_count: 0,
    });

    await data.users.update("tenant1", "auth0|user1", {
      email: "updated@example.com",
      email_verified: true,
    });

    const fetched = await data.users.get("tenant1", "auth0|user1");
    expect(fetched!.email).toBe("updated@example.com");
    expect(fetched!.email_verified).toBe(true);
  });

  it("should list users", async () => {
    await data.users.create("tenant1", {
      user_id: "auth0|user1",
      email: "user1@example.com",
      email_verified: true,
      is_social: false,
      provider: "auth0",
      login_count: 0,
    });
    await data.users.create("tenant1", {
      user_id: "auth0|user2",
      email: "user2@example.com",
      email_verified: true,
      is_social: false,
      provider: "auth0",
      login_count: 0,
    });

    const result = await data.users.list("tenant1");
    expect(result.users.length).toBe(2);
  });

  it("should remove a user", async () => {
    await data.users.create("tenant1", {
      user_id: "auth0|user1",
      email: "delete@example.com",
      email_verified: true,
      is_social: false,
      provider: "auth0",
      login_count: 0,
    });

    const removed = await data.users.remove("tenant1", "auth0|user1");
    expect(removed).toBe(true);

    const fetched = await data.users.get("tenant1", "auth0|user1");
    expect(fetched).toBeNull();
  });
});
