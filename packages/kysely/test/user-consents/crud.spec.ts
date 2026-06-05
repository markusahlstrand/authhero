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

describe("user_consents", () => {
  it("creates a new consent record", async () => {
    const { data, tenantId, userId } = await bootstrap();

    const consent = await data.userConsents.create(tenantId, {
      user_id: userId,
      client_id: "client_abc",
      scopes: ["read:billing", "offline_access"],
    });

    expect(consent.user_id).toBe(userId);
    expect(consent.client_id).toBe("client_abc");
    expect(consent.scopes.sort()).toEqual(
      ["offline_access", "read:billing"].sort(),
    );
    expect(consent.created_at).toBeTypeOf("string");
  });

  it("upserts and unions scopes when called twice", async () => {
    const { data, tenantId, userId } = await bootstrap();

    await data.userConsents.create(tenantId, {
      user_id: userId,
      client_id: "client_abc",
      scopes: ["read:billing"],
    });
    const merged = await data.userConsents.create(tenantId, {
      user_id: userId,
      client_id: "client_abc",
      scopes: ["write:billing", "read:billing"],
    });

    expect(merged.scopes.sort()).toEqual(
      ["read:billing", "write:billing"].sort(),
    );

    const fetched = await data.userConsents.get(tenantId, userId, "client_abc");
    expect(fetched?.scopes.sort()).toEqual(
      ["read:billing", "write:billing"].sort(),
    );
  });

  it("returns null when no consent exists", async () => {
    const { data, tenantId, userId } = await bootstrap();
    const fetched = await data.userConsents.get(
      tenantId,
      userId,
      "missing_client",
    );
    expect(fetched).toBeNull();
  });

  it("removes a consent record", async () => {
    const { data, tenantId, userId } = await bootstrap();
    await data.userConsents.create(tenantId, {
      user_id: userId,
      client_id: "client_abc",
      scopes: ["read:billing"],
    });

    const removed = await data.userConsents.remove(
      tenantId,
      userId,
      "client_abc",
    );
    expect(removed).toBe(true);

    const fetched = await data.userConsents.get(tenantId, userId, "client_abc");
    expect(fetched).toBeNull();
  });

  it("lists consents scoped to a tenant", async () => {
    const { data, tenantId, userId } = await bootstrap();
    await data.userConsents.create(tenantId, {
      user_id: userId,
      client_id: "client_a",
      scopes: ["read:billing"],
    });
    await data.userConsents.create(tenantId, {
      user_id: userId,
      client_id: "client_b",
      scopes: ["read:profile"],
    });

    const list = await data.userConsents.list(tenantId, {
      include_totals: true,
      per_page: 50,
    });
    expect(list.user_consents).toHaveLength(2);
    expect(list.length).toBe(2);
  });
});
