import type { ScriptBinding } from "./cf-api";

/**
 * Public types for the Workers-for-Platforms + D1 tenant provisioner.
 *
 * Wire-up shape — the operator constructs a provisioner once at control-plane
 * boot and passes its `onProvision` / `onDeprovision` to
 * `@authhero/multi-tenancy`'s `databaseIsolation` config. Every tenant
 * create/delete in the management API then drives a CF API call sequence
 * that:
 *   1. (create) provisions a per-tenant D1, applies migrations, deploys a
 *      namespaced worker bound to that D1, and uploads secrets to it.
 *   2. (delete) removes the namespaced worker and its D1.
 *
 * Failures throw — the multi-tenancy hook wraps `onProvision` such that a
 * thrown error rolls the tenant row back. Idempotency on retry is best-effort:
 * each step checks for "already exists" and continues, but the operator
 * should treat the provisioning sequence as restartable rather than
 * transactional.
 */

/**
 * SQL migration to run on every new tenant D1, in order.
 *
 * Operators bundle these from `@authhero/drizzle`'s `drizzle/sqlite/` files
 * via their build tool of choice (vite's `?raw`, esbuild loader, webpack's
 * raw-loader, etc.) — the provisioner is agnostic about how the SQL gets
 * loaded.
 */
export interface ProvisionerMigration {
  /** Filename, used only for error messages and audit logging. */
  name: string;
  /** Full SQL text of the migration. May contain multiple statements. */
  sql: string;
}

/**
 * Resolver that returns the secret values to upload onto a newly-provisioned
 * tenant worker. Called once per tenant during `onProvision`.
 *
 * Implementations typically pull from a secret store (Vault, GCP Secret
 * Manager, etc.) — the values must match the control-plane authhero's
 * expectations for that tenant (notably `ENCRYPTION_KEY` and JWT signing
 * material, which must be byte-stable to keep encrypted-at-rest data and
 * issued JWTs valid).
 */
export type TenantSecretsResolver = (
  tenantId: string,
) => Promise<Record<string, string>>;

export interface CloudflareWfpD1ProvisionerOptions {
  /** Cloudflare account id that owns the namespace, D1s, and tenant workers. */
  accountId: string;
  /**
   * API token with at least these permissions on `accountId`:
   *   - Workers Scripts:Edit
   *   - D1:Edit
   *   - Workers for Platforms:Edit (for namespace ops)
   */
  apiToken: string;
  /** Name of the dispatch namespace tenant workers are deployed into. */
  dispatchNamespace: string;
  /**
   * Base URL of the control-plane authhero. Passed to the tenant worker via
   * the `CONTROL_PLANE_BASE_URL` env var so its `controlPlaneSync` destination
   * knows where to POST `controlplane.sync.*` events.
   */
  controlPlaneBaseUrl: string;
  /**
   * Full JavaScript bundle of the tenant worker. The operator builds this
   * (typically via esbuild/vite of a thin wrapper that calls
   * `authhero.init({ ... })`), and passes the resulting JS string here.
   *
   * The bundle MUST be self-contained — Cloudflare's script upload doesn't
   * resolve npm dependencies. Use your bundler's `format: 'esm'` + `external`
   * lists to inline `authhero`, `@authhero/drizzle`, and friends.
   */
  tenantWorkerScript: string;
  /**
   * Optional script metadata override. Defaults to
   * `{ main_module: "index.js", compatibility_date, compatibility_flags: ["nodejs_compat"] }`.
   * Set `compatibility_date` to the same date the rest of your workers use.
   */
  scriptMetadata?: {
    main_module?: string;
    compatibility_date?: string;
    compatibility_flags?: string[];
  };
  /**
   * SQL migrations applied in array order to every new tenant D1. Typically
   * loaded from `@authhero/drizzle`'s shipped migrations via your build tool.
   */
  migrations: ProvisionerMigration[];
  /**
   * Resolver that returns the secret values to set on the tenant worker.
   * Called once per `onProvision`. The provisioner uploads each entry via
   * the per-script secrets API.
   */
  secrets: TenantSecretsResolver;
  /**
   * Extra bindings to attach to every provisioned tenant worker, appended
   * after the always-present `AUTH_DB` (d1) and `CONTROL_PLANE_BASE_URL`
   * (plain_text) bindings. Use this to wire e.g. a `service` binding to a
   * shared upstream worker, or additional `plain_text` config the tenant
   * bundle expects. Secrets still go through the `secrets` resolver, not here.
   *
   * `uploadNamespacedScript` forwards these verbatim into the CF script
   * metadata, so any binding type the CF API accepts is valid.
   */
  extraBindings?: ScriptBinding[];
  /**
   * Naming convention for the namespaced script. Supports `{tenant_id}`
   * placeholder. Defaults to `"{tenant_id}"`.
   *
   * Must match whatever the dispatcher synthesizes as `script_name` in its
   * `dispatch_namespace` handler — otherwise the dispatcher can't reach the
   * worker after provisioning.
   */
  scriptNameTemplate?: string;
  /**
   * Naming convention for the per-tenant D1. Supports `{tenant_id}`.
   * Defaults to `"tenant-{tenant_id}"`. CF accepts most ASCII names; keep
   * it stable so a re-provision finds the existing D1.
   */
  d1NameTemplate?: string;
  /**
   * Fetch override (tests only). Defaults to global `fetch`.
   */
  fetch?: typeof fetch;
  /**
   * Per-request timeout (ms) on the CF API. Defaults to 30s. Individual
   * D1 migrations can take a few seconds each; the upload of a multi-MB
   * tenant bundle also takes a noticeable chunk of that.
   */
  timeoutMs?: number;
}

/**
 * Outcome of a successful `onProvision` — returned so the caller can persist
 * the resource IDs back onto the tenant row (`tenants.d1_database_id`,
 * `tenants.worker_script_name`). The control-plane authhero ships these
 * fields in its schema; `createWfpTenantProvisioningHook` writes them
 * automatically.
 */
export interface ProvisionResult {
  d1DatabaseId: string;
  scriptName: string;
  d1Name: string;
}

/**
 * What `createCloudflareWfpD1Provisioner` returns — the two lifecycle
 * callbacks that plug into `databaseIsolation` from `@authhero/multi-tenancy`
 * via the `createWfpTenantProvisioningHook` wrapper (which handles
 * deployment-type guarding and tenant-row writebacks).
 */
export interface CloudflareWfpD1Provisioner {
  onProvision(tenantId: string): Promise<ProvisionResult>;
  onDeprovision(tenantId: string): Promise<void>;
}
