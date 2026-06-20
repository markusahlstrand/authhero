/**
 * `@authhero/cloudflare-adapter/wfp` — the Workers-for-Platforms control-plane
 * sync surface. Kept out of the package's main entry because it imports the
 * app-level packages (`authhero`, `@authhero/multi-tenancy`), which are
 * **optional peer dependencies**: install them only if you import this subpath.
 */
export {
  createDispatchSyncDefaults,
  type DispatchSyncDefaultsOptions,
} from "./dispatch-sync-defaults";

export {
  createWfpTenantApp,
  type WfpTenantEnv,
  type WfpTenantAppOptions,
} from "./tenant-app";
