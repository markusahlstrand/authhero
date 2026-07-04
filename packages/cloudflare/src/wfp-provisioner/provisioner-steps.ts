import {
  CloudflareApiClient,
  CloudflareApiError,
  type ScriptBinding,
} from "./cf-api";
import type { CloudflareWfpD1ProvisionerOptions } from "./types";

const DEFAULT_SCRIPT_NAME_TEMPLATE = "{tenant_id}";
const DEFAULT_D1_NAME_TEMPLATE = "tenant-{tenant_id}";
const DEFAULT_MAIN_MODULE = "index.js";
const DEFAULT_COMPATIBILITY_DATE = "2026-05-01";

// The recorded version token is persisted into `tenants.database_version`,
// a 64-char column. Reject anything longer up front so we never run the
// Cloudflare side effects and then fail the control-plane write afterwards.
const MAX_DATABASE_VERSION_LENGTH = 64;

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

export function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof CloudflareApiError)) return false;
  return err.status === 404;
}

export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export interface TenantProvisionNames {
  scriptName: string;
  databaseName: string;
}

/**
 * Provider-agnostic contract for the individual, idempotent units of
 * tenant provisioning. Deliberately free of Cloudflare/D1 terminology so
 * the durable operation orchestration (issue #1026 phase 2) — and any
 * future provider (e.g. Bunny with its SQLite databases) — can run against
 * it. `createWfpProvisionerSteps` is the Cloudflare Workers-for-Platforms
 * + D1 implementation.
 */
export interface TenantProvisionerSteps {
  names(tenantId: string): TenantProvisionNames;
  /**
   * Validate the version token persisted into `tenants.database_version`
   * BEFORE any provider side effects. Returns the recorded versions.
   */
  validate(): {
    databaseVersion?: string;
    bundleConfiguration?: string;
    workerVersion?: string;
  };
  findOrCreateDatabase(
    name: string,
  ): Promise<{ id: string; created: boolean }>;
  /**
   * Reconcile migrations against the provisioner-owned tracking table
   * (`_authhero_provisioner_migrations`), including the legacy backfill
   * branch for pre-tracking databases.
   */
  applyMigrations(databaseId: string, created: boolean): Promise<void>;
  uploadScript(scriptName: string, databaseId: string): Promise<void>;
  uploadSecrets(scriptName: string, tenantId: string): Promise<void>;
  /** Best-effort teardown of both resources; throws a combined error. */
  deprovision(tenantId: string): Promise<void>;
}

/**
 * The Cloudflare WFP + D1 implementation of `TenantProvisionerSteps`,
 * extracted from `createCloudflareWfpD1Provisioner` so each unit can run
 * as its own durable workflow step while the inline provisioner keeps
 * running them as one sequence. No behavior change from the original
 * closures — the provisioner is a thin sequence over this object.
 */
export interface WfpProvisionerSteps extends TenantProvisionerSteps {
  /** Underlying REST client — shared with deprovision and the verify step. */
  client: CloudflareApiClient;
}

export function createWfpProvisionerSteps(
  options: CloudflareWfpD1ProvisionerOptions,
): WfpProvisionerSteps {
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

  // D1 has no native migration tracking, so the provisioner keeps its own
  // table recording which migrations have been applied. This lets a provision
  // that died partway through its migration list heal on retry — already-
  // applied migrations are skipped, only the missing tail is run — instead of
  // relying on a one-shot "freshly created" flag that can't see partial state.
  const MIGRATIONS_TABLE = "_authhero_provisioner_migrations";

  /** Pull a string column out of D1 query result blocks. */
  function collectStringColumn(
    result: { results?: unknown[] }[],
    column: string,
  ): string[] {
    const values: string[] = [];
    for (const block of result) {
      for (const row of block.results ?? []) {
        if (row && typeof row === "object" && column in row) {
          const value = (row as Record<string, unknown>)[column];
          if (typeof value === "string") values.push(value);
        }
      }
    }
    return values;
  }

  async function migrationsTableExists(databaseId: string): Promise<boolean> {
    const result = await client.execD1(
      databaseId,
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${MIGRATIONS_TABLE}';`,
    );
    return collectStringColumn(result, "name").length > 0;
  }

  async function ensureMigrationsTable(databaseId: string): Promise<void> {
    await client.execD1(
      databaseId,
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);`,
    );
  }

  async function appliedMigrationNames(
    databaseId: string,
  ): Promise<Set<string>> {
    const result = await client.execD1(
      databaseId,
      `SELECT name FROM ${MIGRATIONS_TABLE};`,
    );
    return new Set(collectStringColumn(result, "name"));
  }

  async function recordMigration(
    databaseId: string,
    name: string,
  ): Promise<void> {
    const appliedAt = new Date().toISOString();
    await client.execD1(
      databaseId,
      `INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES ('${escapeSqlLiteral(name)}', '${escapeSqlLiteral(appliedAt)}');`,
    );
  }

  /**
   * Apply every migration not yet recorded in the tracking table, recording
   * each as it lands. Reconciling against the tracking table (rather than a
   * one-shot flag) is what makes a half-finished provision recoverable.
   *
   * Caveat: D1 has no transactional DDL, so a single migration *file* that
   * fails midway can still leave that one file partly applied. Author
   * migrations defensively (`CREATE TABLE IF NOT EXISTS`, guarded
   * `ADD COLUMN`) so re-running the failed file converges. Cross-file partial
   * failure is handled here; intra-file is the migration author's job.
   */
  async function applyPendingMigrations(databaseId: string): Promise<void> {
    const applied = await appliedMigrationNames(databaseId);
    for (const migration of options.migrations) {
      if (applied.has(migration.name)) continue;
      try {
        await client.execD1(databaseId, migration.sql);
      } catch (err) {
        // Tag the error with the migration name so the operator can tell
        // what failed.
        if (err instanceof Error) {
          throw new Error(
            `Failed to apply migration "${migration.name}" to D1 ${databaseId}: ${err.message}`,
            { cause: err },
          );
        }
        throw err;
      }
      await recordMigration(databaseId, migration.name);
    }
  }

  return {
    client,

    names(tenantId: string): TenantProvisionNames {
      return {
        scriptName: fillTemplate(scriptNameTemplate, tenantId),
        databaseName: fillTemplate(d1NameTemplate, tenantId),
      };
    },

    validate() {
      const lastMigration = options.migrations[options.migrations.length - 1];
      const databaseVersion = lastMigration?.name;
      if (
        databaseVersion !== undefined &&
        databaseVersion.length > MAX_DATABASE_VERSION_LENGTH
      ) {
        throw new Error(
          `Migration name "${databaseVersion}" exceeds the ${MAX_DATABASE_VERSION_LENGTH}-character database_version limit.`,
        );
      }
      return {
        databaseVersion,
        bundleConfiguration: options.bundleConfiguration,
        workerVersion: options.workerVersion,
      };
    },

    async findOrCreateDatabase(
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
    },

    async applyMigrations(databaseId: string, created: boolean): Promise<void> {
      // Migrations are reconciled against a provisioner-owned tracking
      // table rather than gated on the `created` flag — a provision that
      // died partway through its migrations leaves an orphaned, partially
      // migrated D1, and the `created` flag alone can't tell that apart
      // from a fully migrated one. A fresh D1, or one we've tracked before,
      // reconciles: apply only the migrations not yet recorded.
      const tracked = created ? false : await migrationsTableExists(databaseId);
      if (created || tracked) {
        await ensureMigrationsTable(databaseId);
        await applyPendingMigrations(databaseId);
      } else {
        // Legacy existing D1 from before tracking existed. We can't tell a
        // fully-migrated DB from a partial one, and re-running migrations
        // would error on already-present tables — so preserve the historical
        // "assume already migrated" heal behavior, but backfill the tracking
        // table so future re-provisions reconcile exactly.
        logger?.warn(
          `D1 ${databaseId} has no migration-tracking table — assuming it predates tracking and is fully migrated; backfilling the tracking table and skipping migrations.`,
        );
        await ensureMigrationsTable(databaseId);
        for (const migration of options.migrations) {
          await recordMigration(databaseId, migration.name);
        }
      }
    },

    async uploadScript(scriptName: string, databaseId: string): Promise<void> {
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
    },

    async uploadSecrets(scriptName: string, tenantId: string): Promise<void> {
      const values = await options.secrets(tenantId);
      for (const [name, value] of Object.entries(values)) {
        await client.setNamespacedScriptSecret(
          dispatchNamespace,
          scriptName,
          name,
          value,
        );
      }
    },

    async deprovision(tenantId: string): Promise<void> {
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
