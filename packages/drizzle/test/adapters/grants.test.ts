import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("grants adapter", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;

    await data.tenants.create({ id: "t1", name: "Tenant 1" });
    await data.users.create("t1", {
      user_id: "auth2|user1",
      email: "user1@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });
  });

  it("should create and get a grant", async () => {
    const grant = await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client1",
      scope: ["openid", "offline_access"],
    });

    expect(grant.id).toBeTruthy();
    expect(grant.clientID).toBe("client1");
    expect(grant.audience).toBeUndefined();
    expect(grant.scope).toEqual(["openid", "offline_access"]);

    const fetched = await data.grants!.get("t1", "auth2|user1", "client1");
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(grant.id);
    expect(fetched!.scope).toEqual(["openid", "offline_access"]);
  });

  it("should union scopes on repeated create for the same natural key", async () => {
    const first = await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client1",
      scope: ["openid"],
    });
    const second = await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client1",
      scope: ["openid", "profile"],
    });

    expect(second.id).toBe(first.id);
    expect(second.scope.sort()).toEqual(["openid", "profile"]);
  });

  it("should keep grants with different audiences separate", async () => {
    await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client1",
      scope: ["openid"],
    });
    await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client1",
      audience: "https://api.example.com",
      scope: ["read:things"],
    });

    const noAudience = await data.grants!.get("t1", "auth2|user1", "client1");
    const withAudience = await data.grants!.get(
      "t1",
      "auth2|user1",
      "client1",
      "https://api.example.com",
    );

    expect(noAudience!.scope).toEqual(["openid"]);
    expect(withAudience!.scope).toEqual(["read:things"]);
    expect(withAudience!.audience).toBe("https://api.example.com");
  });

  it("should list grants with totals", async () => {
    await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client1",
      scope: ["openid"],
    });
    await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client2",
      scope: ["openid"],
    });

    const result = await data.grants!.list("t1", { include_totals: true });
    expect(result.grants.length).toBe(2);
    expect(result.length).toBe(2);
  });

  it("should remove a grant by id", async () => {
    const grant = await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client1",
      scope: ["openid"],
    });

    const removed = await data.grants!.remove("t1", grant.id);
    expect(removed).toBe(true);
    expect(await data.grants!.get("t1", "auth2|user1", "client1")).toBeNull();
  });

  it("should remove all grants for a user", async () => {
    await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client1",
      scope: ["openid"],
    });
    await data.grants!.create("t1", {
      user_id: "auth2|user1",
      clientID: "client2",
      scope: ["openid"],
    });

    const removed = await data.grants!.removeByUser("t1", "auth2|user1");
    expect(removed).toBe(true);

    const result = await data.grants!.list("t1");
    expect(result.grants.length).toBe(0);
  });
});
