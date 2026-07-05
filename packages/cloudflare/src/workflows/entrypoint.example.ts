/**
 * REFERENCE ONLY — not part of the published bundle (nothing imports it).
 *
 * The downstream control-plane worker (the deploy repo) owns the
 * `WorkflowEntrypoint` shell, because `cloudflare:workers` only exists in
 * the Workers runtime. Everything else — orchestration, verify, write-back
 * — comes from `@authhero/cloudflare-adapter/workflows`.
 *
 * wrangler.jsonc:
 * ```jsonc
 * {
 *   "workflows": [
 *     {
 *       "name": "tenant-operations",
 *       "binding": "TENANT_OPERATIONS_WORKFLOW",
 *       "class_name": "TenantOperationWorkflow"
 *     }
 *   ],
 *   // Reconciler cadence: at least daily (engine retention is 30 days);
 *   // every 15–60 minutes recommended.
 *   "triggers": { "crons": ["0,30 * * * *"] }
 * }
 * ```
 *
 * Worker module:
 * ```ts
 * import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
 * import {
 *   createProvisionVerifier,
 *   createCloudflareWorkflowsExecutor,
 *   createWfpWorkflowProvisioningHook,
 *   reconcileTenantOperations,
 *   runProvisionOperation,
 *   type ProvisionOperationDeps,
 *   type TenantOperationWorkflowParams,
 * } from "@authhero/cloudflare-adapter/workflows";
 * import { enqueueTenantOperation } from "@authhero/multi-tenancy";
 * import {
 *   createWfpProvisionerSteps,
 *   createWfpTenantProvisioningHook,
 *   CloudflareApiClient,
 * } from "@authhero/cloudflare-adapter";
 * import { createDispatchSyncDefaults } from "@authhero/cloudflare-adapter/wfp";
 *
 * // Host-owned: build every workflow dependency from the worker env. Params
 * // carry only { operation_id, tenant_id, kind } — never secrets.
 * function buildProvisionDeps(env: Env): ProvisionOperationDeps {
 *   const adapters = createControlPlaneAdapters(env); // host's DB wiring
 *   const steps = createWfpProvisionerSteps({
 *     accountId: env.CLOUDFLARE_ACCOUNT_ID,
 *     apiToken: env.CLOUDFLARE_API_TOKEN,
 *     dispatchNamespace: "authhero-tenants",
 *     controlPlaneBaseUrl: env.PUBLIC_BASE_URL,
 *     tenantWorkerScript,
 *     migrations,
 *     secrets: async (tenantId) => ({ ... }),
 *   });
 *   return {
 *     steps,
 *     tenants: adapters.tenants,
 *     stores: {
 *       tenantOperations: adapters.tenantOperations!,
 *       tenantOperationEvents: adapters.tenantOperationEvents!,
 *     },
 *     syncDefaults: createDispatchSyncDefaults({ ... }),
 *     verify: createProvisionVerifier({ client: steps.client }),
 *   };
 * }
 *
 * export class TenantOperationWorkflow extends WorkflowEntrypoint<Env, TenantOperationWorkflowParams> {
 *   async run(event: WorkflowEvent<TenantOperationWorkflowParams>, step: WorkflowStep) {
 *     // CF's WorkflowStep satisfies StepRunner structurally.
 *     await runProvisionOperation(buildProvisionDeps(this.env), event.payload, step);
 *   }
 * }
 *
 * export default {
 *   fetch: app.fetch,
 *   async scheduled(_controller: ScheduledController, env: Env) {
 *     const adapters = createControlPlaneAdapters(env);
 *     const result = await reconcileTenantOperations({
 *       stores: {
 *         tenantOperations: adapters.tenantOperations!,
 *         tenantOperationEvents: adapters.tenantOperationEvents!,
 *       },
 *       tenants: adapters.tenants,
 *       binding: env.TENANT_OPERATIONS_WORKFLOW,
 *     });
 *     console.log("reconcileTenantOperations", result);
 *   },
 * };
 *
 * // Tenant create wiring — replaces the inline provision (and any
 * // best-effort post-create seed) with a durable enqueue:
 * const inlineHook = createWfpTenantProvisioningHook({ provisioner, tenants, syncDefaults });
 * const workflowHook = createWfpWorkflowProvisioningHook({
 *   tenants: adapters.tenants,
 *   inline: inlineHook, // upgrade/deprovision stay inline until phase 3/4
 *   enqueueOperation: (input) =>
 *     enqueueTenantOperation(
 *       stores,
 *       createCloudflareWorkflowsExecutor({ binding: env.TENANT_OPERATIONS_WORKFLOW }),
 *       input,
 *     ),
 * });
 * // databaseIsolation: {
 * //   getAdapters,
 * //   onProvision: workflowHook.onProvision,
 * //   onDeprovision: workflowHook.onDeprovision,
 * //   recordProvisionOperations: false, // the workflow owns the operation row
 * // }
 * ```
 *
 * Rollout order for existing deployments: apply the control-plane
 * migrations first, deploy the worker with both paths available, then flip
 * tenant-create to the workflow hook.
 */
export {};
