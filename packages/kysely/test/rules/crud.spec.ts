import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("rules adapter", () => {
  it("should create, get, list, update and remove a rule", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "t1";

    const created = await adapters.rules.create(tenant, {
      name: "r1",
      script: "function (user, context, cb) { cb(null, user, context) }",
      order: 1,
      enabled: true,
      stage: "login_success",
    } as any);

    expect(created.id).toBeTruthy();

    const fetched = await adapters.rules.get(tenant, created.id);
    expect(fetched?.name).toBe("r1");
    expect(fetched?.enabled).toBe(true);

    const list = await adapters.rules.list(tenant, {
      page: 0,
      per_page: 10,
      include_totals: true,
      q: "name:r1",
    });
    expect(list.rules.length).toBe(1);

    const updated = await adapters.rules.update(tenant, created.id, {
      enabled: false,
    });
    expect(updated).toBe(true);

    const fetched2 = await adapters.rules.get(tenant, created.id);
    expect(fetched2?.enabled).toBe(false);

    const removed = await adapters.rules.remove(tenant, created.id);
    expect(removed).toBe(true);

    const afterDelete = await adapters.rules.get(tenant, created.id);
    expect(afterDelete).toBeNull();
  });
});
