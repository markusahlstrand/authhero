import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("roles - metadata", () => {
  it("should create a role with metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.roles.create(tenant, {
      name: "admin-no-sync",
      description: "Admin role that should not be synced",
      metadata: {
        sync: false,
        customField: "custom value",
        nested: { key: "value" },
      },
    });

    expect(created).toBeDefined();
    expect(created.name).toBe("admin-no-sync");
    expect(created.metadata).toBeDefined();
    expect(created.metadata?.sync).toBe(false);
    expect(created.metadata?.customField).toBe("custom value");
    expect(created.metadata?.nested).toEqual({ key: "value" });
  });

  it("should get a role with metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.roles.create(tenant, {
      name: "test-role",
      metadata: { sync: false, tier: "premium" },
    });

    const fetched = await adapters.roles.get(tenant, created.id);
    expect(fetched?.metadata).toBeDefined();
    expect(fetched?.metadata?.sync).toBe(false);
    expect(fetched?.metadata?.tier).toBe("premium");
  });

  it("should list roles with metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    await adapters.roles.create(tenant, {
      name: "role-with-metadata",
      metadata: { sync: true, category: "standard" },
    });

    await adapters.roles.create(tenant, {
      name: "role-without-metadata",
    });

    const list = await adapters.roles.list(tenant, {
      page: 0,
      per_page: 10,
      include_totals: true,
    });

    expect(list.roles.length).toBe(2);

    const withMetadata = list.roles.find((r) => r.name === "role-with-metadata");
    expect(withMetadata?.metadata?.sync).toBe(true);
    expect(withMetadata?.metadata?.category).toBe("standard");

    const withoutMetadata = list.roles.find(
      (r) => r.name === "role-without-metadata",
    );
    expect(withoutMetadata?.metadata).toBeUndefined();
  });

  it("should update role metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.roles.create(tenant, {
      name: "updatable-role",
      metadata: { sync: true, version: 1 },
    });

    // Update the metadata
    const updated = await adapters.roles.update(tenant, created.id, {
      metadata: { sync: false, version: 2, newField: "added" },
    });
    expect(updated).toBe(true);

    const fetched = await adapters.roles.get(tenant, created.id);
    expect(fetched?.metadata?.sync).toBe(false);
    expect(fetched?.metadata?.version).toBe(2);
    expect(fetched?.metadata?.newField).toBe("added");
  });

  it("should handle role without metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.roles.create(tenant, {
      name: "simple-role",
      description: "A role without metadata",
    });

    expect(created.metadata).toBeUndefined();

    const fetched = await adapters.roles.get(tenant, created.id);
    expect(fetched?.metadata).toBeUndefined();
  });
});
