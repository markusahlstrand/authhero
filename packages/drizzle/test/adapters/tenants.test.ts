import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("tenants adapter", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(() => {
    const server = getTestServer();
    data = server.data;
  });

  it("should create and get a tenant", async () => {
    const tenant = await data.tenants.create({
      id: "test-tenant",
      name: "Test Tenant",
      friendly_name: "Test",
    });

    expect(tenant.id).toBe("test-tenant");
    expect(tenant.name).toBe("Test Tenant");

    const fetched = await data.tenants.get("test-tenant");
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe("test-tenant");
    expect(fetched!.name).toBe("Test Tenant");
  });

  it("should list tenants", async () => {
    await data.tenants.create({ id: "t1", name: "Tenant 1" });
    await data.tenants.create({ id: "t2", name: "Tenant 2" });

    const result = await data.tenants.list();
    expect(result.tenants.length).toBe(2);
  });

  it("should update a tenant", async () => {
    await data.tenants.create({ id: "t1", name: "Original" });
    await data.tenants.update("t1", { name: "Updated" });

    const fetched = await data.tenants.get("t1");
    expect(fetched!.name).toBe("Updated");
  });

  it("should remove a tenant", async () => {
    await data.tenants.create({ id: "t1", name: "To Delete" });
    const removed = await data.tenants.remove("t1");
    expect(removed).toBe(true);

    const fetched = await data.tenants.get("t1");
    expect(fetched).toBeNull();
  });

  it("should handle JSON fields", async () => {
    await data.tenants.create({
      id: "t1",
      name: "JSON Test",
      flags: { enable_client_connections: true },
      enabled_locales: ["en", "sv"],
    });

    const fetched = await data.tenants.get("t1");
    expect(fetched!.flags).toEqual({ enable_client_connections: true });
    expect(fetched!.enabled_locales).toEqual(["en", "sv"]);
  });

  it("should handle transactions", async () => {
    await data.tenants.create({ id: "t1", name: "Transaction Test" });

    try {
      await data.transaction(async (trx) => {
        await trx.tenants.update("t1", { name: "In Transaction" });
        throw new Error("Rollback");
      });
    } catch {
      // Expected
    }

    const fetched = await data.tenants.get("t1");
    expect(fetched!.name).toBe("Transaction Test");
  });
});
