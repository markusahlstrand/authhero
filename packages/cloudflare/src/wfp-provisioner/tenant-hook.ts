import type { TenantsDataAdapter } from "@authhero/adapter-interfaces";
import type { CloudflareWfpD1Provisioner } from "./types";

/**
 * Adapt the provisioner to `@authhero/multi-tenancy`'s
 * `databaseIsolation.onProvision` / `onDeprovision` contract by:
 *
 *  1. Looking up the tenant row first and gating on
 *     `tenant.deployment_type === "wfp"` — shared tenants short-circuit so
 *     the same control plane can host both kinds without code branches.
 *  2. Running the provisioner sequence (D1 + script + secrets).
 *  3. Writing the resulting `d1_database_id` + `worker_script_name` +
 *     `provisioning_state` back onto the tenant row so the admin UI can
 *     show real status, and so a redeploy / re-provision knows which
 *     resource ids to operate on.
 *  4. On failure, marking `provisioning_state = "failed"` with the error
 *     message, then re-throwing — the multi-tenancy hook treats the throw
 *     as a signal to roll back the tenant row.
 *
 * Typical wiring on the control-plane authhero:
 *
 * ```ts
 * import { initMultiTenant } from "@authhero/multi-tenancy";
 * import {
 *   createCloudflareWfpD1Provisioner,
 *   createWfpTenantProvisioningHook,
 * } from "@authhero/cloudflare-adapter";
 *
 * const provisioner = createCloudflareWfpD1Provisioner({ ... });
 * const hook = createWfpTenantProvisioningHook({
 *   provisioner,
 *   tenants: dataAdapter.tenants,
 * });
 *
 * const { app } = initMultiTenant({
 *   dataAdapter,
 *   databaseIsolation: {
 *     getAdapters: async (tenantId) => { ... },
 *     onProvision: hook.onProvision,
 *     onDeprovision: hook.onDeprovision,
 *   },
 * });
 * ```
 */
export interface WfpTenantProvisioningHookOptions {
  provisioner: CloudflareWfpD1Provisioner;
  tenants: TenantsDataAdapter;
  /**
   * Optional override of "should this tenant be WFP-provisioned?". Defaults
   * to `tenant.deployment_type === "wfp"`. Provide a custom predicate when
   * the gating signal lives elsewhere (a feature flag, a config table, etc.).
   */
  shouldProvision?: (tenant: {
    id: string;
    deployment_type?: string;
    storage_kind?: string;
  }) => boolean;
  /**
   * Optional `console`-compatible logger for warnings emitted when the
   * tenant row write-back fails after a successful provision. Defaults to
   * a silent no-op so this module stays test-quiet.
   */
  logger?: Pick<Console, "warn">;
  /**
   * Optional post-provision seed run *after* the CF resources exist but
   * *before* the tenant is marked `ready` — typically
   * `createDispatchSyncDefaults(...)`, which projects the control plane's
   * defaults (and the FK-target tenant rows) into the fresh D1.
   *
   * Folding the seed into provisioning closes the "ready but empty D1" gap: a
   * best-effort seed fired separately after this hook can be lost, leaving a
   * tenant marked `ready` whose D1 has no tenant row and no projected defaults.
   * Here, if the seed throws, the tenant is marked `failed` (resource ids are
   * still persisted so a re-provision can find them) and the error is
   * re-thrown. Leave unset to mark `ready` as soon as the resources exist.
   */
  syncDefaults?: (tenantId: string) => Promise<unknown>;
}

export interface WfpTenantProvisioningHook {
  onProvision(tenantId: string): Promise<void>;
  onDeprovision(tenantId: string): Promise<void>;
}

function defaultShouldProvision(tenant: {
  deployment_type?: string;
}): boolean {
  return tenant.deployment_type === "wfp";
}

export function createWfpTenantProvisioningHook(
  options: WfpTenantProvisioningHookOptions,
): WfpTenantProvisioningHook {
  const { provisioner, tenants, syncDefaults } = options;
  const shouldProvision = options.shouldProvision ?? defaultShouldProvision;
  const logger = options.logger;

  async function markFailed(tenantId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await tenants.update(tenantId, {
        provisioning_state: "failed",
        provisioning_error: message.slice(0, 2048),
        provisioning_state_changed_at: new Date().toISOString(),
      });
    } catch (writeErr) {
      // The provision failure is the primary error — surfacing the write-back
      // failure here would swallow it. Log so it's not silent.
      logger?.warn(
        `Failed to write provisioning_state="failed" for tenant ${tenantId}:`,
        writeErr,
      );
    }
  }

  return {
    async onProvision(tenantId: string): Promise<void> {
      const tenant = await tenants.get(tenantId);
      if (!tenant) return; // No tenant row — probably mid-rollback. Nothing to do.
      if (!shouldProvision(tenant)) return; // Shared deployment, skip.

      let result;
      try {
        result = await provisioner.onProvision(tenantId);
      } catch (err) {
        // No resources (or only partial) — nothing to persist beyond the
        // failure marker.
        await markFailed(tenantId, err);
        throw err;
      }

      // Resources exist. Persist their ids regardless of what happens next so a
      // re-provision / deprovision can find them.
      const resourceIds = {
        d1_database_id: result.d1DatabaseId,
        worker_script_name: result.scriptName,
      };

      try {
        // Seed BEFORE marking ready so we never report "ready" over an empty
        // D1 (no tenant row, no projected defaults).
        if (syncDefaults) await syncDefaults(tenantId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          await tenants.update(tenantId, {
            ...resourceIds,
            provisioning_state: "failed",
            provisioning_error: message.slice(0, 2048),
            provisioning_state_changed_at: new Date().toISOString(),
          });
        } catch (writeErr) {
          logger?.warn(
            `Failed to write provisioning_state="failed" for tenant ${tenantId}:`,
            writeErr,
          );
        }
        throw err;
      }

      await tenants.update(tenantId, {
        ...resourceIds,
        provisioning_state: "ready",
        provisioning_error: undefined,
        provisioning_state_changed_at: new Date().toISOString(),
      });
    },

    async onDeprovision(tenantId: string): Promise<void> {
      const tenant = await tenants.get(tenantId);
      // Tenant might be already gone (delete cascades) — if we can't tell what
      // kind it was, default to attempting deprovision so a misconfigured row
      // doesn't leave orphaned CF resources.
      if (tenant && !shouldProvision(tenant)) return;
      await provisioner.onDeprovision(tenantId);
    },
  };
}
