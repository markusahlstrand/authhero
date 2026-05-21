import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";
import type { DataAdapters } from "@authhero/adapter-interfaces";

describe("ActionExecutionsAdapter (kysely)", () => {
  const tenantId = "test-tenant";
  let data: DataAdapters;

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;
  });

  it("round-trips create → get with results and logs", async () => {
    const created = await data.actionExecutions.create(tenantId, {
      id: "exec-1",
      trigger_id: "post-login",
      status: "final",
      results: [
        {
          action_name: "addRole",
          error: null,
          started_at: "2024-01-15T10:00:00.000Z",
          ended_at: "2024-01-15T10:00:00.100Z",
        },
      ],
      logs: [
        {
          action_name: "addRole",
          lines: [{ level: "log", message: "added role admin" }],
        },
      ],
    });

    expect(created.id).toBe("exec-1");
    expect(created.tenant_id).toBe(tenantId);
    expect(created.status).toBe("final");

    const fetched = await data.actionExecutions.get(tenantId, "exec-1");
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe("exec-1");
    expect(fetched?.trigger_id).toBe("post-login");
    expect(fetched?.results).toHaveLength(1);
    expect(fetched?.results[0]?.action_name).toBe("addRole");
    expect(fetched?.logs?.[0]?.lines?.[0]?.message).toBe("added role admin");
  });

  it("persists executions without logs", async () => {
    await data.actionExecutions.create(tenantId, {
      id: "exec-no-logs",
      trigger_id: "credentials-exchange",
      status: "final",
      results: [
        {
          action_name: "noop",
          error: null,
          started_at: "2024-01-15T10:00:00.000Z",
          ended_at: "2024-01-15T10:00:00.001Z",
        },
      ],
    });

    const fetched = await data.actionExecutions.get(tenantId, "exec-no-logs");
    expect(fetched).not.toBeNull();
    expect(fetched?.logs).toBeUndefined();
  });

  it("isolates executions by tenant", async () => {
    await data.actionExecutions.create("tenant-a", {
      id: "exec-shared-id",
      trigger_id: "post-login",
      status: "final",
      results: [],
    });

    const sameIdOtherTenant = await data.actionExecutions.get(
      "tenant-b",
      "exec-shared-id",
    );
    expect(sameIdOtherTenant).toBeNull();
  });

  it("returns null for unknown ids", async () => {
    const fetched = await data.actionExecutions.get(tenantId, "missing");
    expect(fetched).toBeNull();
  });
});
