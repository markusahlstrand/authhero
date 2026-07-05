import { describe, it, expect, vi } from "vitest";
import type { TenantOperation } from "@authhero/adapter-interfaces";
import { createWfpWorkflowProvisioningHook } from "../../src/workflows";
import type { WfpTenantProvisioningHook } from "../../src/wfp-provisioner";
import { fakeTenants } from "./helpers";

function stubOperation(): TenantOperation {
  const now = new Date().toISOString();
  return {
    id: "op_1",
    tenant_id: "kvartal",
    rollout_id: null,
    kind: "provision",
    status: "pending",
    current_step: null,
    engine: "cloudflare-workflows",
    engine_instance_id: "op-provision-kvartal-op_1",
    target_worker_version: null,
    target_database_version: null,
    error: null,
    initiated_by: null,
    created_at: now,
    updated_at: now,
    finished_at: null,
  };
}

function inlineHook(): WfpTenantProvisioningHook & {
  upgrades: string[];
  deprovisions: string[];
} {
  const upgrades: string[] = [];
  const deprovisions: string[] = [];
  return {
    upgrades,
    deprovisions,
    async onProvision() {
      throw new Error("inline onProvision must not be called");
    },
    async onUpgrade(tenantId: string) {
      upgrades.push(tenantId);
    },
    async onDeprovision(tenantId: string) {
      deprovisions.push(tenantId);
    },
  };
}

describe("createWfpWorkflowProvisioningHook", () => {
  it("enqueues a provision operation for wfp tenants and leaves them pending", async () => {
    const tenants = fakeTenants([
      { id: "kvartal", deployment_type: "wfp", provisioning_state: "pending" },
    ]);
    const enqueueOperation = vi.fn(async () => stubOperation());
    const hook = createWfpWorkflowProvisioningHook({
      tenants,
      enqueueOperation,
      inline: inlineHook(),
    });

    await hook.onProvision("kvartal");

    expect(enqueueOperation).toHaveBeenCalledExactlyOnceWith({
      kind: "provision",
      tenant_id: "kvartal",
    });
    // The hook must not touch the snapshot — the workflow owns it.
    expect(tenants.store.get("kvartal")).toMatchObject({
      provisioning_state: "pending",
    });
  });

  it("skips shared and missing tenants without enqueueing", async () => {
    const tenants = fakeTenants([
      { id: "shared-t", deployment_type: "shared" },
    ]);
    const enqueueOperation = vi.fn(async () => stubOperation());
    const hook = createWfpWorkflowProvisioningHook({
      tenants,
      enqueueOperation,
      inline: inlineHook(),
    });

    await hook.onProvision("shared-t");
    await hook.onProvision("does-not-exist");

    expect(enqueueOperation).not.toHaveBeenCalled();
  });

  it("propagates enqueue failures (afterCreate rollback signal)", async () => {
    const tenants = fakeTenants([{ id: "kvartal", deployment_type: "wfp" }]);
    const hook = createWfpWorkflowProvisioningHook({
      tenants,
      enqueueOperation: vi.fn(async () => {
        throw new Error("workflows unavailable");
      }),
      inline: inlineHook(),
    });

    await expect(hook.onProvision("kvartal")).rejects.toThrow(
      "workflows unavailable",
    );
  });

  it("delegates upgrade and deprovision to the inline hook", async () => {
    const tenants = fakeTenants([{ id: "kvartal", deployment_type: "wfp" }]);
    const inline = inlineHook();
    const hook = createWfpWorkflowProvisioningHook({
      tenants,
      enqueueOperation: vi.fn(async () => stubOperation()),
      inline,
    });

    await hook.onUpgrade("kvartal");
    await hook.onDeprovision("kvartal");

    expect(inline.upgrades).toEqual(["kvartal"]);
    expect(inline.deprovisions).toEqual(["kvartal"]);
  });
});
