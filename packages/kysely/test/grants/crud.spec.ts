import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

async function bootstrap(tenantId = "tenantId", userId = "user_1") {
  const { data } = await getTestServer();
  await data.tenants.create({
    id: tenantId,
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
  await data.users.create(tenantId, {
    user_id: userId,
    email: "alice@example.com",
    email_verified: true,
    provider: "auth2",
    connection: "Username-Password-Authentication",
    is_social: false,
    name: "Alice",
  });
  return { data, tenantId, userId };
}

describe("grants", () => {
  it("creates a new grant", async () => {
    const { data, tenantId, userId } = await bootstrap();

    const grant = await data.grants!.create(tenantId, {
      user_id: userId,
      clientID: "client_abc",
      scope: ["read:billing", "offline_access"],
    });

    expect(grant.user_id).toBe(userId);
    expect(grant.clientID).toBe("client_abc");
    expect(grant.scope.sort()).toEqual(
      ["offline_access", "read:billing"].sort(),
    );
  });

  it("upserts and unions scope when called twice", async () => {
    const { data, tenantId, userId } = await bootstrap();

    await data.grants!.create(tenantId, {
      user_id: userId,
      clientID: "client_abc",
      scope: ["read:billing"],
    });
    const merged = await data.grants!.create(tenantId, {
      user_id: userId,
      clientID: "client_abc",
      scope: ["write:billing", "read:billing"],
    });

    expect(merged.scope.sort()).toEqual(
      ["read:billing", "write:billing"].sort(),
    );

    const fetched = await data.grants!.get(tenantId, userId, "client_abc");
    expect(fetched?.scope.sort()).toEqual(
      ["read:billing", "write:billing"].sort(),
    );
  });

  it("returns null when no grant exists", async () => {
    const { data, tenantId, userId } = await bootstrap();
    const fetched = await data.grants!.get(tenantId, userId, "missing_client");
    expect(fetched).toBeNull();
  });

  it("removes a grant by id", async () => {
    const { data, tenantId, userId } = await bootstrap();
    const created = await data.grants!.create(tenantId, {
      user_id: userId,
      clientID: "client_abc",
      scope: ["read:billing"],
    });

    const removed = await data.grants!.remove(tenantId, created.id);
    expect(removed).toBe(true);

    const fetched = await data.grants!.get(tenantId, userId, "client_abc");
    expect(fetched).toBeNull();
  });

  it("removes all grants for a user", async () => {
    const { data, tenantId, userId } = await bootstrap();
    await data.grants!.create(tenantId, {
      user_id: userId,
      clientID: "client_a",
      scope: ["read:billing"],
    });
    await data.grants!.create(tenantId, {
      user_id: userId,
      clientID: "client_b",
      scope: ["read:profile"],
    });

    const removed = await data.grants!.removeByUser(tenantId, userId);
    expect(removed).toBe(true);

    const list = await data.grants!.list(tenantId, { include_totals: true });
    expect(list.grants).toHaveLength(0);
  });

  it("lists grants scoped to a tenant", async () => {
    const { data, tenantId, userId } = await bootstrap();
    await data.grants!.create(tenantId, {
      user_id: userId,
      clientID: "client_a",
      scope: ["read:billing"],
    });
    await data.grants!.create(tenantId, {
      user_id: userId,
      clientID: "client_b",
      scope: ["read:profile"],
    });

    const list = await data.grants!.list(tenantId, {
      include_totals: true,
      per_page: 50,
    });
    expect(list.grants).toHaveLength(2);
    expect(list.length).toBe(2);
  });
});
