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

  it("stores activity counters in user_activity and reads them back", async () => {
    await data.users.create("tenant1", {
      user_id: "auth0|user1",
      email: "active@example.com",
      email_verified: true,
      is_social: false,
      provider: "auth0",
    });

    // No activity yet: missing user_activity row coalesces to 0.
    const fresh = await data.users.get("tenant1", "auth0|user1");
    expect(fresh!.login_count).toBe(0);
    expect(fresh!.last_login).toBeUndefined();

    // The post-login write path.
    await data.userActivity!.upsert("tenant1", "auth0|user1", {
      last_login: "2026-07-02T10:00:00.000Z",
      last_ip: "1.2.3.4",
      login_count: 3,
    });

    const activity = await data.userActivity!.get("tenant1", "auth0|user1");
    expect(activity).toMatchObject({
      last_login: "2026-07-02T10:00:00.000Z",
      last_ip: "1.2.3.4",
      login_count: 3,
    });

    // users.get merges the counters via the join.
    const fetched = await data.users.get("tenant1", "auth0|user1");
    expect(fetched!.login_count).toBe(3);
    expect(fetched!.last_login).toBe("2026-07-02T10:00:00.000Z");
    expect(fetched!.last_ip).toBe("1.2.3.4");

    // Legacy callers passing counters through users.update are routed too.
    await data.users.update("tenant1", "auth0|user1", { login_count: 4 });
    const updated = await data.users.get("tenant1", "auth0|user1");
    expect(updated!.login_count).toBe(4);
    // A partial upsert must not clobber other activity fields.
    expect(updated!.last_ip).toBe("1.2.3.4");

    // Filtering and sorting on activity fields resolve against the join.
    const filtered = await data.users.list("tenant1", {
      q: "login_count:>0",
    });
    expect(filtered.users.map((u) => u.user_id)).toEqual(["auth0|user1"]);
    const none = await data.users.list("tenant1", { q: "login_count:>10" });
    expect(none.users).toHaveLength(0);
  });

  it("treats users without an activity row as login_count 0 in filters and sorts", async () => {
    // get/list present a missing user_activity row as login_count 0, so
    // filters and sorts must match that shape (COALESCE, not the raw NULL).
    await data.users.create("tenant1", {
      user_id: "auth0|never",
      email: "never@example.com",
      email_verified: true,
      is_social: false,
      provider: "auth0",
    });
    await data.users.create("tenant1", {
      user_id: "auth0|active",
      email: "active@example.com",
      email_verified: true,
      is_social: false,
      provider: "auth0",
    });
    await data.userActivity!.upsert("tenant1", "auth0|active", {
      login_count: 5,
    });

    const neverLoggedIn = await data.users.list("tenant1", {
      q: "login_count:0",
    });
    expect(neverLoggedIn.users.map((u) => u.user_id)).toEqual(["auth0|never"]);

    const below = await data.users.list("tenant1", { q: "login_count:<5" });
    expect(below.users.map((u) => u.user_id)).toEqual(["auth0|never"]);

    const ascending = await data.users.list("tenant1", {
      sort: { sort_by: "login_count", sort_order: "asc" },
    });
    expect(ascending.users.map((u) => u.user_id)).toEqual([
      "auth0|never",
      "auth0|active",
    ]);

    const descending = await data.users.list("tenant1", {
      sort: { sort_by: "login_count", sort_order: "desc" },
    });
    expect(descending.users.map((u) => u.user_id)).toEqual([
      "auth0|active",
      "auth0|never",
    ]);
  });

  it("persists activity fields passed at creation time", async () => {
    // e.g. lazy Auth0 migration records the login on the created user.
    await data.users.create("tenant1", {
      user_id: "auth0|migrated",
      email: "migrated@example.com",
      email_verified: true,
      is_social: false,
      provider: "auth0",
      last_login: "2026-07-01T00:00:00.000Z",
      last_ip: "5.6.7.8",
    });

    const fetched = await data.users.get("tenant1", "auth0|migrated");
    expect(fetched!.last_login).toBe("2026-07-01T00:00:00.000Z");
    expect(fetched!.last_ip).toBe("5.6.7.8");

    const activity = await data.userActivity!.get("tenant1", "auth0|migrated");
    expect(activity!.last_login).toBe("2026-07-01T00:00:00.000Z");
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

    // login_count at create time seeds a user_activity row, so the remove
    // below must clean it up too.
    expect(
      await data.userActivity!.get("tenant1", "auth0|user1"),
    ).not.toBeNull();

    const removed = await data.users.remove("tenant1", "auth0|user1");
    expect(removed).toBe(true);

    const fetched = await data.users.get("tenant1", "auth0|user1");
    expect(fetched).toBeNull();

    expect(await data.userActivity!.get("tenant1", "auth0|user1")).toBeNull();
  });
});
