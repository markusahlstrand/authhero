import type { DataAdapters } from "@authhero/adapter-interfaces";
import {
  buildControlPlaneDefaultsPayload,
  type ControlPlaneDefaultsApplyResult,
  type DefaultsPayloadEntities,
} from "@authhero/multi-tenancy";
import type { DispatchNamespace } from "../code-executor";

const DEFAULT_SCRIPT_NAME_TEMPLATE = "tenant-{tenant_id}-auth";
const DEFAULT_TIMEOUT_MS = 30_000;
const SYNC_PATH = "/internal/sync-defaults";

export interface DispatchSyncDefaultsOptions {
  /** The dispatch namespace binding the tenant workers live in. */
  dispatcher: DispatchNamespace;
  /** Script-name convention. Supports `{tenant_id}`. */
  scriptNameTemplate?: string;
  /**
   * Shared secret the tenant worker checks on `/internal/sync-defaults`
   * (`WFP_INTERNAL_SYNC_SECRET`). Sent as a bearer token.
   */
  internalSecret: string;
  /** The control-plane tenant id whose defaults are projected. */
  controlPlaneTenantId: string;
  /** Adapters for reading the control plane's rows (secrets decrypted). */
  controlPlaneAdapters: DataAdapters;
  /** Which entities to include in the payload. Defaults to all. */
  entities?: DefaultsPayloadEntities;
  /** Per-push timeout. Defaults to 30s. */
  timeoutMs?: number;
}

function fillTemplate(template: string, tenantId: string): string {
  return template.replace(/\{tenant_id\}/g, tenantId);
}

/**
 * Builds a **push** function that projects the control plane's defaults into a
 * single tenant's database over a dispatch namespace.
 *
 * Pure push: the control plane builds the payload with
 * `buildControlPlaneDefaultsPayload` and POSTs it to the tenant worker's
 * `/internal/sync-defaults` route (which applies it). The tenant worker never
 * calls back to the control plane. Use the returned function as the
 * provision-time seed and for on-change / rotation re-syncs.
 *
 * Resolves with the tenant worker's {@link ControlPlaneDefaultsApplyResult} so
 * the caller can act on what actually landed — warn when an entity's `received`
 * is `0`, surface per-entity `errors`, or assert the signing keys projected.
 * Rejects (does not resolve) when the push fails or the worker returns non-2xx.
 */
export function createDispatchSyncDefaults(
  options: DispatchSyncDefaultsOptions,
): (tenantId: string) => Promise<ControlPlaneDefaultsApplyResult> {
  const {
    dispatcher,
    scriptNameTemplate = DEFAULT_SCRIPT_NAME_TEMPLATE,
    internalSecret,
    controlPlaneTenantId,
    controlPlaneAdapters,
    entities,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  return async (tenantId: string): Promise<ControlPlaneDefaultsApplyResult> => {
    const payload = await buildControlPlaneDefaultsPayload(
      controlPlaneAdapters,
      controlPlaneTenantId,
      entities,
      // Include the target tenant's own FK-target row alongside the
      // control-plane row, so the tenant's own writes resolve their FK too.
      tenantId,
    );

    const scriptName = fillTemplate(scriptNameTemplate, tenantId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await dispatcher
        .get(scriptName)
        .fetch(`https://tenant.internal${SYNC_PATH}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${internalSecret}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // The tenant worker tags structured failures with `X-Authhero-Error`;
      // include it so the caller sees the error code, not just the status.
      const code = response.headers.get("x-authhero-error");
      throw new Error(
        `sync-defaults push to "${scriptName}" failed: ${response.status}` +
          `${code ? ` (${code})` : ""} ${body.slice(0, 256)}`,
      );
    }

    return (await response.json()) as ControlPlaneDefaultsApplyResult;
  };
}
