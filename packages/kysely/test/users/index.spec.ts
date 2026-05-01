import { describe, expect, it } from "vitest";

import { Strategy } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

// Basic CRUD tests for users
describe("users", () => {
  it("should support crud operations", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Create
    // --------------------------------
    const createdUser = await data.users.create("tenantId", {
      user_id: "email|user1",
      email: "user1@example.com",
      name: "User One",
      email_verified: true,
      is_social: false,
      app_metadata: { foo: "bar" },
      user_metadata: { hello: "world" },
      connection: Strategy.USERNAME_PASSWORD,
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
    // --------------------------------
    const updateResult = await data.users.update("tenantId", "email|user1", {
      name: "User One Updated",
      email_verified: false,
    });
    expect(updateResult).toBe(true);

    // ----------------------------------------
    // Get
    // --------------------------------
    const getUser = await data.users.get("tenantId", "email|user1");
    expect(getUser).toMatchObject({
      user_id: "email|user1",
      name: "User One Updated",
      email_verified: false,
    });

    // ----------------------------------------
    // Delete
    // --------------------------------
    const deleteResult = await data.users.remove("tenantId", "email|user1");
    expect(deleteResult).toBe(true);

    // ----------------------------------------
    // Get with not found
    // --------------------------------
    const getUserNotFound = await data.users.get("tenantId", "email|user1");
    expect(getUserNotFound).toBe(null);
  });

  describe("list q sanitization", () => {
    async function seed() {
      const { data } = await getTestServer();

      for (const id of ["t1", "t2"]) {
        await data.tenants.create({
          id,
          friendly_name: `Tenant ${id}`,
          audience: `https://${id}.example.com`,
          sender_email: `login@${id}.example.com`,
          sender_name: "SenderName",
        });
      }

      await data.users.create("t1", {
        user_id: "email|t1user",
        email: "t1@example.com",
        name: "T1 User",
        email_verified: true,
        is_social: false,
        app_metadata: {},
        user_metadata: {},
        connection: Strategy.USERNAME_PASSWORD,
        provider: "authhero",
      });

      await data.users.create("t2", {
        user_id: "email|t2user",
        email: "t2@example.com",
        name: "T2 User",
        email_verified: true,
        is_social: false,
        app_metadata: {},
        user_metadata: {},
        connection: Strategy.USERNAME_PASSWORD,
        provider: "authhero",
      });

      return data;
    }

    it("ignores non-whitelisted fields and keeps tenant scoping", async () => {
      const data = await seed();

      // tenant_id is not in the whitelist; the clause must be dropped so the
      // query stays scoped to t1 and does not return t2's user.
      const result = await data.users.list("t1", { q: "tenant_id:t2" });
      expect(result.users).toHaveLength(1);
      expect(result.users[0].user_id).toBe("email|t1user");
    });

    it("applies whitelisted field filters", async () => {
      const data = await seed();

      const match = await data.users.list("t1", { q: "email:t1@example.com" });
      expect(match.users).toHaveLength(1);
      expect(match.users[0].user_id).toBe("email|t1user");

      const miss = await data.users.list("t1", { q: "email:other@example.com" });
      expect(miss.users).toHaveLength(0);
    });

    it("preserves bare-string searches", async () => {
      const data = await seed();

      const result = await data.users.list("t1", { q: "T1" });
      expect(result.users).toHaveLength(1);
      expect(result.users[0].user_id).toBe("email|t1user");
    });

    it("supports filtering by provider and linked_to (used by core flows)", async () => {
      const data = await seed();

      // Add a linked user under t1.
      await data.users.create("t1", {
        user_id: "email|t1linked",
        email: "t1-linked@example.com",
        name: "Linked",
        email_verified: true,
        is_social: false,
        app_metadata: {},
        user_metadata: {},
        connection: Strategy.USERNAME_PASSWORD,
        provider: "auth2",
        linked_to: "email|t1user",
      });

      const byProvider = await data.users.list("t1", { q: "provider:auth2" });
      expect(byProvider.users.map((u) => u.user_id)).toEqual(["email|t1linked"]);

      const byLinkedTo = await data.users.list("t1", {
        q: "linked_to:email|t1user",
      });
      expect(byLinkedTo.users.map((u) => u.user_id)).toEqual([
        "email|t1linked",
      ]);
    });
  });
});
