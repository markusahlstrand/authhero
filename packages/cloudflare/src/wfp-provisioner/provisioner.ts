import { createWfpProvisionerSteps } from "./provisioner-steps";
import type {
  CloudflareWfpD1Provisioner,
  CloudflareWfpD1ProvisionerOptions,
  ProvisionResult,
} from "./types";

/**
 * Construct the lifecycle hooks for provisioning + deprovisioning a tenant
 * on Cloudflare Workers-for-Platforms backed by a per-tenant D1.
 *
 * Wiring on the control-plane authhero:
 *
 * ```ts
 * import createAdapters from "@authhero/cloudflare-adapter";
 * import { createCloudflareWfpD1Provisioner } from "@authhero/cloudflare-adapter";
 * import { initMultiTenant } from "@authhero/multi-tenancy";
 * import tenantWorkerScript from "./tenant-worker.dist.js?raw";
 * import migration0001 from "@authhero/drizzle/drizzle/sqlite/0000_initial.sql?raw";
 *
 * const provisioner = createCloudflareWfpD1Provisioner({
 *   accountId: env.CLOUDFLARE_ACCOUNT_ID,
 *   apiToken: env.CLOUDFLARE_API_TOKEN,
 *   dispatchNamespace: "authhero-tenants",
 *   controlPlaneBaseUrl: env.PUBLIC_BASE_URL,
 *   tenantWorkerScript,
 *   migrations: [{ name: "0000_initial.sql", sql: migration0001 }],
 *   secrets: async (tenantId) => ({
 *     ENCRYPTION_KEY: env.SHARED_ENCRYPTION_KEY,
 *     ISSUER: `https://${tenantId}.tokens.example.com`,
 *   }),
 * });
 *
 * const { app } = initMultiTenant({
 *   dataAdapter,
 *   controlPlane: { tenantId: "main", clientId: "platform" },
 *   databaseIsolation: {
 *     getAdapters: async (tenantId) => { ... },   // resolve per-tenant adapter
 *     onProvision: provisioner.onProvision,
 *     onDeprovision: provisioner.onDeprovision,
 *   },
 * });
 * ```
 *
 * On tenant create, the management API row write fires
 * `databaseIsolation.onProvision(tenantId)` which runs the full sequence
 * below. If any step throws, the upstream `createProvisioningHooks` rolls
 * back the tenant row — though side effects already taken (D1 created,
 * partial migrations applied) are NOT rolled back. The operator should
 * treat re-running `onProvision(tenantId)` as safe; each step is idempotent
 * on "already exists".
 *
 * The individual steps live in `createWfpProvisionerSteps` so the durable
 * workflow executor (issue #1026 phase 2) can run the same units with
 * per-step retries; this factory is a thin inline sequence over them.
 */
export function createCloudflareWfpD1Provisioner(
  options: CloudflareWfpD1ProvisionerOptions,
): CloudflareWfpD1Provisioner {
  const steps = createWfpProvisionerSteps(options);

  return {
    async onProvision(tenantId: string): Promise<ProvisionResult> {
      const { scriptName, databaseName } = steps.names(tenantId);

      // Validate the version token we'll persist BEFORE any Cloudflare side
      // effects — otherwise an oversize migration name only surfaces after the
      // tenant is provisioned, leaving the control-plane update broken.
      const { databaseVersion, bundleConfiguration, workerVersion } =
        steps.validate();

      // 1. D1: create-if-missing, capture id + whether we just created it.
      const { id: databaseId, created } =
        await steps.findOrCreateDatabase(databaseName);

      // 2. Reconcile migrations against the provisioner-owned tracking table
      //    (including the legacy backfill for pre-tracking D1s).
      await steps.applyMigrations(databaseId, created);

      // 3. Upload the namespaced script with bindings. An upload overwrites, so
      //    this re-heals an orphaned worker on re-provision.
      await steps.uploadScript(scriptName, databaseId);

      // 4. Set per-tenant secrets. Order matters only for our own logging
      //    — CF processes each set independently.
      await steps.uploadSecrets(scriptName, tenantId);

      // `databaseVersion` is the last migration in the configured list (they
      // apply in array order), validated for length at the top of this hook.
      return {
        d1DatabaseId: databaseId,
        scriptName,
        d1Name: databaseName,
        bundleConfiguration,
        workerVersion,
        databaseVersion,
      };
    },

    async onDeprovision(tenantId: string): Promise<void> {
      await steps.deprovision(tenantId);
    },
  };
}
