import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("roles", () => {
  it("should create, get, list, update and remove a role", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    // Create a role
    const created = await adapters.roles.create(tenant, {
      name: "admin",
      description: "Administrator role",
    });

    expect(created).toBeDefined();
    expect(created.name).toBe("admin");
    expect(created.description).toBe("Administrator role");
    expect(created.id).toBeDefined();

    // Get the role
    const fetched = await adapters.roles.get(tenant, created.id);
    expect(fetched?.name).toBe("admin");

    // List roles
    const list = await adapters.roles.list(tenant, {
      page: 0,
      per_page: 10,
      include_totals: true,
    });
    expect(list.roles.length).toBe(1);
    expect(list.roles[0]?.name).toBe("admin");

    // Search roles
    const searchList = await adapters.roles.list(tenant, {
      page: 0,
      per_page: 10,
      include_totals: true,
      q: "name:admin",
    });
    expect(searchList.roles.length).toBe(1);

    // Update the role
    const updated = await adapters.roles.update(tenant, created.id, {
      description: "Updated administrator role",
    });
    expect(updated).toBe(true);

    const fetched2 = await adapters.roles.get(tenant, created.id);
    expect(fetched2?.description).toBe("Updated administrator role");

    // Remove the role
    const removed = await adapters.roles.remove(tenant, created.id);
    expect(removed).toBe(true);

    const afterDelete = await adapters.roles.get(tenant, created.id);
    expect(afterDelete).toBeNull();

    // List roles after deletion
    const emptyList = await adapters.roles.list(tenant, {
      page: 0,
      per_page: 10,
      include_totals: true,
    });
    expect(emptyList.roles.length).toBe(0);
  });
});
