import { describe, it, expect, vi } from "vitest";
import type {
  Tenant,
  TenantsDataAdapter,
} from "@authhero/adapter-interfaces";
import { NoopTenantProvisioner } from "../../src/provisioning";

function mockTenantsAdapter(): TenantsDataAdapter {
  return {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
  };
}

function tenantFixture(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    friendly_name: "Tenant",
    audience: "https://api.example.com",
    sender_name: "Tenant",
    sender_email: "noreply@example.com",
    created_at: "2026-06-06T00:00:00Z",
    updated_at: "2026-06-06T00:00:00Z",
    deployment_type: "shared",
    provisioning_state: "ready",
    ...overrides,
  };
}

describe("NoopTenantProvisioner", () => {
  it("does nothing when tenant is already ready and has no error", async () => {
    const tenants = mockTenantsAdapter();
    const provisioner = new NoopTenantProvisioner();

    await provisioner.provision(tenantFixture(), { tenants });

    expect(tenants.update).not.toHaveBeenCalled();
  });

  it("flips a pending tenant to ready", async () => {
    const tenants = mockTenantsAdapter();
    const provisioner = new NoopTenantProvisioner();

    await provisioner.provision(
      tenantFixture({ provisioning_state: "pending" }),
      { tenants },
    );

    expect(tenants.update).toHaveBeenCalledTimes(1);
    expect(tenants.update).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        provisioning_state: "ready",
        provisioning_error: undefined,
      }),
    );
    const update = (tenants.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(update.provisioning_state_changed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("clears a residual provisioning_error on an already-ready tenant", async () => {
    const tenants = mockTenantsAdapter();
    const provisioner = new NoopTenantProvisioner();

    await provisioner.provision(
      tenantFixture({
        provisioning_state: "ready",
        provisioning_error: "prior failure",
      }),
      { tenants },
    );

    expect(tenants.update).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        provisioning_state: "ready",
        provisioning_error: undefined,
      }),
    );
  });

  it("recovers a failed tenant by flipping it to ready", async () => {
    const tenants = mockTenantsAdapter();
    const provisioner = new NoopTenantProvisioner();

    await provisioner.provision(
      tenantFixture({
        provisioning_state: "failed",
        provisioning_error: "CF API 503",
      }),
      { tenants },
    );

    expect(tenants.update).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        provisioning_state: "ready",
        provisioning_error: undefined,
      }),
    );
  });

  it("resolves even when tenants.update rejects", async () => {
    const tenants = mockTenantsAdapter();
    (tenants.update as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("DB down"),
    );
    const provisioner = new NoopTenantProvisioner();

    await expect(
      provisioner.provision(
        tenantFixture({ provisioning_state: "pending" }),
        { tenants },
      ),
    ).resolves.toBeUndefined();
    expect(tenants.update).toHaveBeenCalledTimes(1);
  });
});
