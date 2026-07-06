import {
  CustomDomainsAdapter,
  CacheAdapter,
  LogsDataAdapter,
  GeoAdapter,
  RateLimitAdapter,
  AnalyticsAdapter,
  ActionExecutionsAdapter,
} from "@authhero/adapter-interfaces";
import { createCustomDomainsAdapter } from "./customDomains";
import { createCloudflareCache } from "./cache";
import {
  createR2SQLLogsAdapter,
  type R2SQLLogsAdapterConfig,
} from "./r2-sql-logs";
import {
  createAnalyticsEngineLogsAdapter,
  createAnalyticsEngineAnalyticsAdapter,
  type AnalyticsEngineLogsAdapterConfig,
  type AnalyticsEngineDataset,
} from "./analytics-engine-logs";
import {
  createAnalyticsEngineActionExecutionsAdapter,
  type AnalyticsEngineActionExecutionsAdapterConfig,
} from "./analytics-engine-action-executions";
import { createCloudflareGeoAdapter } from "./geo";
import {
  createCloudflareRateLimitAdapter,
  type CloudflareRateLimitBinding,
  type CloudflareRateLimitBindings,
} from "./rate-limit";
import { CloudflareConfig } from "./types/CloudflareConfig";

// Re-export R2 SQL config type for convenience
export type { R2SQLLogsAdapterConfig };
// Re-export Analytics Engine config types for convenience
export type { AnalyticsEngineLogsAdapterConfig, AnalyticsEngineDataset };
export type { AnalyticsEngineActionExecutionsAdapterConfig };
// Re-export rate-limit types so consumers can type their wrangler bindings
export type { CloudflareRateLimitBinding, CloudflareRateLimitBindings };
export { createCloudflareRateLimitAdapter } from "./rate-limit";
export type { CloudflareConfig };

// Code executors. Two flavours are exposed:
//   - `DispatchNamespaceCodeExecutor` (Workers for Platforms): user code is
//     pre-deployed as worker scripts and invoked via a dispatch namespace.
//   - `WorkerLoaderCodeExecutor` (Worker Loader): isolates are spun up on the
//     fly from in-memory code; no separate deploy step.
// `CloudflareCodeExecutor` is kept as a deprecated alias of the dispatch one.
export {
  DispatchNamespaceCodeExecutor,
  type DispatchNamespaceCodeExecutorConfig,
  type DispatchNamespace,
  CloudflareCodeExecutor,
  type CloudflareCodeExecutorConfig,
} from "./code-executor";
export { generateWorkerScript } from "./code-executor/worker-template";
export {
  WorkerLoaderCodeExecutor,
  type WorkerLoader,
  type WorkerCode,
  type WorkerStub,
  type WorkerLoaderCodeExecutorOptions,
} from "./code-executor/worker-loader";

// Re-export adapters for direct usage
export { createAnalyticsEngineLogsAdapter } from "./analytics-engine-logs";
export { createAnalyticsEngineStatsAdapter } from "./analytics-engine-logs";
export { createAnalyticsEngineAnalyticsAdapter } from "./analytics-engine-logs";
export { createAnalyticsEngineActionExecutionsAdapter } from "./analytics-engine-action-executions";
export { createR2SQLLogsAdapter } from "./r2-sql-logs";
export { createR2SQLStatsAdapter } from "./r2-sql-logs";

// Workers-for-Platforms + D1 tenant provisioner. Plug
// `provisioner.onProvision/onDeprovision` into
// `@authhero/multi-tenancy`'s `databaseIsolation` config to provision a
// per-tenant D1 + namespaced worker on every tenant create.
export {
  createCloudflareWfpD1Provisioner,
  createWfpProvisionerSteps,
  createWfpTenantProvisioningHook,
  createWfpForwardMiddleware,
  CloudflareApiClient,
  CloudflareApiError,
} from "./wfp-provisioner";
export type {
  CloudflareWfpD1Provisioner,
  CloudflareWfpD1ProvisionerOptions,
  TenantProvisionerSteps,
  TenantProvisionNames,
  WfpProvisionerSteps,
  ProvisionResult,
  ProvisionerMigration,
  TenantSecretsResolver,
  WfpTenantProvisioningHook,
  WfpTenantProvisioningHookOptions,
  CfApiClientOptions,
  D1Database,
  D1QueryResult,
  ScriptBinding,
  ScriptUploadOptions,
  WfpForwardOptions,
} from "./wfp-provisioner";

export interface CloudflareAdapters {
  customDomains: CustomDomainsAdapter;
  cache: CacheAdapter;
  logs?: LogsDataAdapter;
  analytics?: AnalyticsAdapter;
  geo?: GeoAdapter;
  rateLimit?: RateLimitAdapter;
  actionExecutions?: ActionExecutionsAdapter;
}

export default function createAdapters(
  config: CloudflareConfig,
): CloudflareAdapters {
  const adapters: CloudflareAdapters = {
    customDomains: createCustomDomainsAdapter(config),
    // Always create a cache adapter (let createCloudflareCache apply defaults)
    cache: createCloudflareCache({
      ...(config.cacheName && { cacheName: config.cacheName }),
      ...(config.defaultTtlSeconds !== undefined && {
        defaultTtlSeconds: config.defaultTtlSeconds,
      }),
      ...(config.keyPrefix && { keyPrefix: config.keyPrefix }),
    }),
    // Always create the geo adapter - it extracts location from Cloudflare headers
    // passed at request time via getGeoInfo(headers)
    geo: createCloudflareGeoAdapter(),
  };

  // Add logs adapter if configured
  // R2 SQL logs takes precedence if both are configured
  if (config.r2SqlLogs) {
    adapters.logs = createR2SQLLogsAdapter(config.r2SqlLogs);
  } else if (config.analyticsEngineLogs) {
    adapters.logs = createAnalyticsEngineLogsAdapter(
      config.analyticsEngineLogs,
    );
  }

  if (config.analyticsEngineLogs) {
    adapters.analytics = createAnalyticsEngineAnalyticsAdapter(
      config.analyticsEngineLogs,
    );
  }

  if (config.analyticsEngineActionExecutions) {
    adapters.actionExecutions = createAnalyticsEngineActionExecutionsAdapter(
      config.analyticsEngineActionExecutions,
    );
  }

  // Rate limiter is opt-in: only create the adapter if at least one
  // scope binding is configured. Missing bindings are not an error.
  const rateLimit = createCloudflareRateLimitAdapter(config.rateLimitBindings);
  if (rateLimit) {
    adapters.rateLimit = rateLimit;
  }

  return adapters;
}
