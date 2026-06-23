import {
  CloudflareApiClient,
  CloudflareApiError,
  type ScriptBinding,
} from "./cf-api";
import type {
  CloudflareWfpD1Provisioner,
  CloudflareWfpD1ProvisionerOptions,
  ProvisionResult,
} from "./types";

const DEFAULT_SCRIPT_NAME_TEMPLATE = "{tenant_id}";
const DEFAULT_D1_NAME_TEMPLATE = "tenant-{tenant_id}";
const DEFAULT_MAIN_MODULE = "index.js";
const DEFAULT_COMPATIBILITY_DATE = "2026-05-01";

function fillTemplate(template: string, tenantId: string): string {
  return template.replace(/\{tenant_id\}/g, tenantId);
}

function isAlreadyExistsError(err: unknown): boolean {
  if (!(err instanceof CloudflareApiError)) return false;
  // CF returns 400 for "name already taken" on D1 and 409 on some endpoints;
  // also the `errors` array may contain `{ code: 7501 }` or similar. The
  // safest check is on the textual body since the codes vary by resource.
  const body = err.body.toLowerCase();
  return (
    err.status === 409 ||
    body.includes("already exists") ||
    body.includes("name is already taken") ||
    body.includes("already in use")
  );
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof CloudflareApiError)) return false;
  return err.status === 404;
}

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
 */
export function createCloudflareWfpD1Provisioner(
  options: CloudflareWfpD1ProvisionerOptions,
): CloudflareWfpD1Provisioner {
  const client = new CloudflareApiClient({
    accountId: options.accountId,
    apiToken: options.apiToken,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  });

  const scriptNameTemplate =
    options.scriptNameTemplate ?? DEFAULT_SCRIPT_NAME_TEMPLATE;
  const d1NameTemplate = options.d1NameTemplate ?? DEFAULT_D1_NAME_TEMPLATE;
  const mainModule = options.scriptMetadata?.main_module ?? DEFAULT_MAIN_MODULE;
  const compatibilityDate =
    options.scriptMetadata?.compatibility_date ?? DEFAULT_COMPATIBILITY_DATE;
  const compatibilityFlags = options.scriptMetadata?.compatibility_flags ?? [
    "nodejs_compat",
  ];
  const dispatchNamespace = options.dispatchNamespace;
  const logger = options.logger;

  async function findOrCreateD1(
    name: string,
  ): Promise<{ id: string; created: boolean }> {
    // List with a name filter first — CF doesn't return a stable 409 on
    // duplicate name, so checking ahead of time avoids racing.
    const existing = await client.listD1Databases(name);
    const match = existing.find((db) => db.name === name);
    if (match) return { id: match.uuid, created: false };
    try {
      const created = await client.createD1Database(name);
      return { id: created.uuid, created: true };
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err;
      // Lost the race — re-list to find the uuid the other writer just made.
      const after = await client.listD1Databases(name);
      const found = after.find((db) => db.name === name);
      if (found) return { id: found.uuid, created: false };
      throw err;
    }
  }

  async function applyMigrations(databaseId: string): Promise<void> {
    for (const migration of options.migrations) {
      try {
        await client.execD1(databaseId, migration.sql);
      } catch (err) {
        // D1 doesn't natively track migrations, so re-running an already-
        // applied migration usually surfaces as a duplicate-column / table
        // error. Tag the error with the migration name so the operator can
        // tell what failed.
        if (err instanceof Error) {
          throw new Error(
            `Failed to apply migration "${migration.name}" to D1 ${databaseId}: ${err.message}`,
            { cause: err },
          );
        }
        throw err;
      }
    }
  }

  async function uploadScript(
    scriptName: string,
    databaseId: string,
  ): Promise<void> {
    const bindings: ScriptBinding[] = [
      { type: "d1", name: "AUTH_DB", id: databaseId },
      {
        type: "plain_text",
        name: "CONTROL_PLANE_BASE_URL",
        text: options.controlPlaneBaseUrl,
      },
      ...(options.extraBindings ?? []),
    ];

    await client.uploadNamespacedScript(dispatchNamespace, scriptName, {
      script: options.tenantWorkerScript,
      mainModule,
      compatibilityDate,
      compatibilityFlags,
      bindings,
      tags: ["authhero-tenant", `tenant:${scriptName}`],
    });
  }

  async function uploadSecrets(
    scriptName: string,
    tenantId: string,
  ): Promise<void> {
    const values = await options.secrets(tenantId);
    for (const [name, value] of Object.entries(values)) {
      await client.setNamespacedScriptSecret(
        dispatchNamespace,
        scriptName,
        name,
        value,
      );
    }
  }

  return {
    async onProvision(tenantId: string): Promise<ProvisionResult> {
      const scriptName = fillTemplate(scriptNameTemplate, tenantId);
      const d1Name = fillTemplate(d1NameTemplate, tenantId);

      // 1. D1: create-if-missing, capture id + whether we just created it.
      const { id: databaseId, created } = await findOrCreateD1(d1Name);

      // 2. Apply migrations only to a freshly-created D1. Re-running them on an
      //    already-provisioned (orphaned) D1 surfaces as duplicate-column /
      //    table errors — which is exactly the case a re-provision hits when
      //    healing an orphaned worker. Migrations aren't tracked by D1, so the
      //    safe idempotent choice is to migrate once, at creation.
      if (created) {
        await applyMigrations(databaseId);
      } else {
        logger?.warn(
          `D1 "${d1Name}" already exists — skipping migrations (assuming already applied) and re-uploading the worker to heal it.`,
        );
      }

      // 3. Upload the namespaced script with bindings. An upload overwrites, so
      //    this re-heals an orphaned worker on re-provision.
      await uploadScript(scriptName, databaseId);

      // 4. Set per-tenant secrets. Order matters only for our own logging
      //    — CF processes each set independently.
      await uploadSecrets(scriptName, tenantId);

      return { d1DatabaseId: databaseId, scriptName, d1Name };
    },

    async onDeprovision(tenantId: string): Promise<void> {
      const scriptName = fillTemplate(scriptNameTemplate, tenantId);
      const d1Name = fillTemplate(d1NameTemplate, tenantId);

      // Both teardowns are attempted even if one fails — a script-delete error
      // must not leave the D1 orphaned (and vice versa). Errors are collected
      // and thrown together at the end so the caller still sees the failure but
      // the resources are guaranteed to have had a deletion attempt. Both
      // tolerate "already gone" so a re-deprovision (or a half-torn-down
      // tenant) converges to fully removed.
      const errors: unknown[] = [];

      // 1. Delete the namespaced script.
      try {
        await client.deleteNamespacedScript(dispatchNamespace, scriptName);
      } catch (err) {
        if (!isNotFoundError(err)) errors.push(err);
      }

      // 2. Delete the D1. Look it up by name first; tolerate "already gone".
      try {
        const existing = await client.listD1Databases(d1Name);
        const target = existing.find((db) => db.name === d1Name);
        if (target) {
          try {
            await client.deleteD1Database(target.uuid);
          } catch (err) {
            if (!isNotFoundError(err)) errors.push(err);
          }
        }
      } catch (err) {
        // Even the lookup failing shouldn't be swallowed — record it.
        errors.push(err);
      }

      if (errors.length > 0) {
        const message = errors
          .map((e) => (e instanceof Error ? e.message : String(e)))
          .join("; ");
        throw new Error(
          `Deprovision of tenant "${tenantId}" had ${errors.length} failure(s): ${message}`,
          { cause: errors[0] },
        );
      }
    },
  };
}
