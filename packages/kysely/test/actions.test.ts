import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";
import type { DataAdapters } from "@authhero/adapter-interfaces";

describe("ActionsAdapter (kysely)", () => {
  const tenantId = "test-tenant";
  let data: DataAdapters;

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;

    for (let i = 0; i < 5; i++) {
      await data.actions.create(tenantId, {
        name: `action-${i}`,
        code: "exports.onExecutePostLogin = async () => {};",
        supported_triggers: [{ id: "post-login" }],
      });
    }
  });

  it("reports the requested window when include_totals is false", async () => {
    const result = await data.actions.list(tenantId, {
      page: 1,
      per_page: 2,
      include_totals: false,
    });

    expect(result.actions).toHaveLength(2);
    expect(result.start).toBe(2);
    expect(result.limit).toBe(2);
    // Without a count query, `length` is the size of this page.
    expect(result.length).toBe(2);
  });

  it("reports a short last page without claiming there are no results", async () => {
    const result = await data.actions.list(tenantId, {
      page: 2,
      per_page: 2,
      include_totals: false,
    });

    expect(result.actions).toHaveLength(1);
    expect(result.start).toBe(4);
    expect(result.limit).toBe(2);
    expect(result.length).toBe(1);
  });

  it("reports the total when include_totals is true", async () => {
    const result = await data.actions.list(tenantId, {
      page: 1,
      per_page: 2,
      include_totals: true,
    });

    expect(result.actions).toHaveLength(2);
    expect(result.start).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.length).toBe(5);
  });

  it("only lists the actions of the requested tenant", async () => {
    await data.actions.create("other-tenant", {
      name: "foreign",
      code: "exports.onExecutePostLogin = async () => {};",
    });

    const result = await data.actions.list(tenantId, { include_totals: false });

    expect(result.actions).toHaveLength(5);
    expect(result.actions.every((a) => a.tenant_id === tenantId)).toBe(true);
  });
});
