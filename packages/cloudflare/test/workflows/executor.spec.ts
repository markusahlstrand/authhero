import { describe, it, expect } from "vitest";
import type { TenantOperation } from "@authhero/adapter-interfaces";
import { createCloudflareWorkflowsExecutor } from "../../src/workflows";
import { fakeBinding } from "./helpers";

function operation(overrides: Partial<TenantOperation> = {}): TenantOperation {
  const now = new Date().toISOString();
  return {
    id: "op_abc123",
    tenant_id: "kvartal",
    rollout_id: null,
    kind: "provision",
    status: "pending",
    current_step: null,
    engine: "cloudflare-workflows",
    engine_instance_id: "op-provision-kvartal-op_abc123",
    target_worker_version: null,
    target_database_version: null,
    error: null,
    initiated_by: null,
    created_at: now,
    updated_at: now,
    finished_at: null,
    ...overrides,
  };
}

describe("createCloudflareWorkflowsExecutor", () => {
  it("creates an instance with the stored id and serializable params", async () => {
    const binding = fakeBinding();
    const executor = createCloudflareWorkflowsExecutor({ binding });

    await executor.start(operation());

    expect(binding.created).toHaveLength(1);
    const { id, params } = binding.created[0]!;
    expect(id).toBe("op-provision-kvartal-op_abc123");
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(JSON.parse(JSON.stringify(params))).toEqual({
      operation_id: "op_abc123",
      tenant_id: "kvartal",
      kind: "provision",
    });
  });

  it("derives the instance id when the row carries none", async () => {
    const binding = fakeBinding();
    const executor = createCloudflareWorkflowsExecutor({ binding });

    await executor.start(operation({ engine_instance_id: null }));

    expect(binding.created[0]!.id).toBe("op-provision-kvartal-op_abc123");
  });

  it("treats a duplicate instance id as success", async () => {
    const binding = fakeBinding();
    const executor = createCloudflareWorkflowsExecutor({ binding });

    await executor.start(operation());
    await expect(executor.start(operation())).resolves.toBeUndefined();
    expect(binding.created).toHaveLength(1);
  });

  it("propagates other engine errors", async () => {
    const binding = fakeBinding();
    binding.createError = new Error("workflows unavailable");
    const executor = createCloudflareWorkflowsExecutor({ binding });

    await expect(executor.start(operation())).rejects.toThrow(
      "workflows unavailable",
    );
  });

  it("rejects unsupported kinds and fleet operations", async () => {
    const binding = fakeBinding();
    const executor = createCloudflareWorkflowsExecutor({ binding });

    await expect(
      executor.start(operation({ kind: "upgrade" })),
    ).rejects.toThrow(/does not support "upgrade"/);
    await expect(
      executor.start(operation({ tenant_id: null })),
    ).rejects.toThrow(/require a tenant_id/);
  });
});
