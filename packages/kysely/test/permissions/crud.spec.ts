import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("permissions adapter", () => {
  it("should create, get, list, update and remove a permission", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "t1";

    const created = await adapters.permissions.create(tenant, {
      permission_name: "read:foo",
      description: "Read foo",
      resource_server_identifier: "https://api.example.com/",
      resource_server_name: "My API",
      sources: [{ source_type: "DIRECT" }],
    } as any);

    expect(created.permission_name).toBe("read:foo");
    expect(created.sources?.[0]?.source_type).toBe("DIRECT");

    const fetched = await adapters.permissions.get(tenant, (created as any).id);
    expect(fetched?.resource_server_name).toBe("My API");

    const list = await adapters.permissions.list(tenant, {
      page: 0,
      per_page: 10,
      include_totals: true,
      q: "permission_name:read:foo",
    });
    expect(list.permissions.length).toBe(1);

    const updated = await adapters.permissions.update(
      tenant,
      (created as any).id,
      {
        description: "Read foo (updated)",
      } as any,
    );
    expect(updated).toBe(true);

    const fetched2 = await adapters.permissions.get(
      tenant,
      (created as any).id,
    );
    expect(fetched2?.description).toBe("Read foo (updated)");

    const removed = await adapters.permissions.remove(
      tenant,
      (created as any).id,
    );
    expect(removed).toBe(true);

    const afterDelete = await adapters.permissions.get(
      tenant,
      (created as any).id,
    );
    expect(afterDelete).toBeNull();
  });
});
