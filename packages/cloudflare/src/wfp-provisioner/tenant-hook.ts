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
   * Here, if the seed throws — or resolves with collected per-entity errors
   * (the seed applies with `continueOnError`, so failures surface in the
   * result rather than as a rejection) — the tenant is marked `failed`
   * (resource ids are still persisted so a re-provision can find them) and the
   * error is re-thrown. Leave unset to mark `ready` as soon as the resources
   * exist.
   */
  syncDefaults?: (tenantId: string) => Promise<unknown>;
}

/**
 * Structural mirror of `@authhero/multi-tenancy`'s `StepReporter` — kept
 * local so this module carries no multi-tenancy dependency. When the
 * control plane records provisions as tenant operations (issue #1026),
 * the hook receives this callback and surfaces coarse step boundaries
 * (`provision-resources`, `seed-defaults`) in the operation history.
 */
export type WfpProvisioningStepReporter = (
  step: string,
  outcome: "started" | "succeeded" | "failed",
  detail?: Record<string, unknown>,
) => Promise<void>;

export interface WfpTenantProvisioningHook {
  onProvision(
    tenantId: string,
    report?: WfpProvisioningStepReporter,
  ): Promise<void>;
  onDeprovision(tenantId: string): Promise<void>;
  /**
   * Re-run provisioning for an already-existing WFP tenant to pull it onto the
   * current bundle + migrations — i.e. an upgrade. Re-uploads the worker
   * script (an upload overwrites), reconciles any migrations not yet applied to
   * the tenant D1, re-runs `syncDefaults`, then rewrites `worker_version`,
   * `bundle_configuration`, and `database_version` so the recorded versions
   * reflect what now runs. Marks `provisioning_state = "pending"` while the
   * upgrade is in flight and `ready` on success (`failed` on error).
   *
   * Throws if the tenant doesn't exist or isn't WFP-provisioned — callers
   * (e.g. a management-API redeploy endpoint) surface that as a 4xx.
   */
  onUpgrade(
    tenantId: string,
    report?: WfpProvisioningStepReporter,
  ): Promise<void>;
}

function defaultShouldProvision(tenant: { deployment_type?: string }): boolean {
  return tenant.deployment_type === "wfp";
}

/**
 * Collects per-entity `errors` from a sync-defaults apply result. The seed runs
 * with `continueOnError`, so the tenant worker returns a 2xx (no rejection)
 * even when individual entities fail — a clean resolve is therefore not proof
 * the seed landed. Walk the result's entity outcomes and surface any collected
 * errors so a partially-seeded tenant isn't marked `ready`.
 */
function collectSyncDefaultsErrors(result: unknown): string[] {
  if (typeof result !== "object" || result === null) return [];
  const errors: string[] = [];
  for (const outcome of Object.values(result)) {
    if (
      typeof outcome === "object" &&
      outcome !== null &&
      "errors" in outcome &&
      Array.isArray(outcome.errors)
    ) {
      for (const err of outcome.errors) {
        if (typeof err === "string") errors.push(err);
      }
    }
  }
  return errors;
}

// Cap persisted error text (tenant rows and reported step details) so a
// verbose upstream failure can't bloat control-plane records.
const MAX_ERROR_LENGTH = 2048;

function errorMessage(error: unknown): string {
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else {
    try {
      message = String(error);
    } catch {
      // String() throws for e.g. null-prototype objects; this helper runs in
      // failure paths and must never mask the original error.
      message = Object.prototype.toString.call(error);
    }
  }
  return message.slice(0, MAX_ERROR_LENGTH);
}

export function createWfpTenantProvisioningHook(
  options: WfpTenantProvisioningHookOptions,
): WfpTenantProvisioningHook {
  const { provisioner, tenants, syncDefaults } = options;
  const shouldProvision = options.shouldProvision ?? defaultShouldProvision;
  const logger = options.logger;

  async function markFailed(tenantId: string, error: unknown): Promise<void> {
    try {
      await tenants.update(tenantId, {
        provisioning_state: "failed",
        provisioning_error: errorMessage(error),
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

  /**
   * Shared provision/upgrade body: run the provisioner (idempotent — creates or
   * heals the D1, overwrites the worker, reconciles pending migrations), seed
   * defaults, then write the resource ids + recorded versions and mark `ready`.
   * Failure at any step marks the tenant `failed` (persisting resource ids when
   * we have them) and re-throws.
   */
  async function provisionAndPersist(
    tenantId: string,
    report?: WfpProvisioningStepReporter,
  ): Promise<void> {
    // Reporting is observability only — a throwing reporter must never
    // fail (or retry) an otherwise healthy provision.
    const reportStep: WfpProvisioningStepReporter = async (
      step,
      outcome,
      detail,
    ) => {
      if (!report) return;
      try {
        await report(step, outcome, detail);
      } catch (reportErr) {
        logger?.warn(
          `Failed to report provisioning step "${step}" for tenant ${tenantId}:`,
          reportErr,
        );
      }
    };

    await reportStep("provision-resources", "started");
    let result;
    try {
      result = await provisioner.onProvision(tenantId);
    } catch (err) {
      // No resources (or only partial) — nothing to persist beyond the
      // failure marker.
      await reportStep("provision-resources", "failed", {
        message: errorMessage(err),
      });
      await markFailed(tenantId, err);
      throw err;
    }

    // Resources exist. Persist their ids + recorded versions regardless of what
    // happens next so a re-provision / deprovision / drift check can find them.
    const resourceIds = {
      d1_database_id: result.d1DatabaseId,
      worker_script_name: result.scriptName,
      bundle_configuration: result.bundleConfiguration,
      worker_version: result.workerVersion,
      database_version: result.databaseVersion,
    };
    await reportStep("provision-resources", "succeeded", { ...resourceIds });

    try {
      // Seed BEFORE marking ready so we never report "ready" over an empty
      // D1 (no tenant row, no projected defaults). The seed runs with
      // `continueOnError`, so a resolved result can still carry per-entity
      // errors — treat those as a provisioning failure too.
      if (syncDefaults) {
        await reportStep("seed-defaults", "started");
        try {
          const seedResult = await syncDefaults(tenantId);
          const seedErrors = collectSyncDefaultsErrors(seedResult);
          if (seedErrors.length > 0) {
            throw new Error(
              `sync-defaults seed reported ${seedErrors.length} error(s): ${seedErrors.join("; ")}`,
            );
          }
          await reportStep("seed-defaults", "succeeded");
        } catch (seedErr) {
          await reportStep("seed-defaults", "failed", {
            message: errorMessage(seedErr),
          });
          throw seedErr;
        }
      }

      await tenants.update(tenantId, {
        ...resourceIds,
        provisioning_state: "ready",
        provisioning_error: undefined,
        provisioning_state_changed_at: new Date().toISOString(),
      });
    } catch (err) {
      try {
        await tenants.update(tenantId, {
          ...resourceIds,
          provisioning_state: "failed",
          provisioning_error: errorMessage(err),
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
  }

  return {
    async onProvision(
      tenantId: string,
      report?: WfpProvisioningStepReporter,
    ): Promise<void> {
      const tenant = await tenants.get(tenantId);
      if (!tenant) return; // No tenant row — probably mid-rollback. Nothing to do.
      if (!shouldProvision(tenant)) return; // Shared deployment, skip.

      await provisionAndPersist(tenantId, report);
    },

    async onUpgrade(
      tenantId: string,
      report?: WfpProvisioningStepReporter,
    ): Promise<void> {
      const tenant = await tenants.get(tenantId);
      if (!tenant) {
        throw new Error(`Cannot upgrade tenant "${tenantId}": not found.`);
      }
      if (!shouldProvision(tenant)) {
        throw new Error(
          `Cannot upgrade tenant "${tenantId}": not a WFP-provisioned tenant.`,
        );
      }

      // Flip to `pending` so the admin UI reflects an in-flight upgrade. A
      // failure inside `provisionAndPersist` overwrites this with `failed`.
      try {
        await tenants.update(tenantId, {
          provisioning_state: "pending",
          // Clear any error from a previous failed attempt so a retried
          // upgrade starts clean — otherwise a stale error lingers alongside
          // the in-flight `pending` state. Mirrors the success path.
          provisioning_error: undefined,
          provisioning_state_changed_at: new Date().toISOString(),
        });
      } catch (writeErr) {
        // Non-fatal — the upgrade can still proceed; the state just won't show
        // `pending` in the meantime.
        logger?.warn(
          `Failed to write provisioning_state="pending" for tenant ${tenantId}:`,
          writeErr,
        );
      }

      await provisionAndPersist(tenantId, report);
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
