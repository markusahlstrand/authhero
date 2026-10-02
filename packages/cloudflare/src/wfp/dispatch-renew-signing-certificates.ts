import type { DispatchNamespace } from "../code-executor";
import {
  DEFAULT_SCRIPT_NAME_TEMPLATE,
  DEFAULT_TIMEOUT_MS,
  fillTemplate,
} from "./dispatch-sync-defaults";

const RENEW_PATH = "/internal/renew-signing-certificates";

export interface DispatchRenewSigningCertificatesOptions {
  /** The dispatch namespace binding the tenant workers live in. */
  dispatcher: DispatchNamespace;
  /** Script-name convention. Supports `{tenant_id}`. */
  scriptNameTemplate?: string;
  /** `WFP_INTERNAL_SYNC_SECRET`, sent as a bearer token. */
  internalSecret: string;
  /** Per-push timeout. Defaults to 30s. */
  timeoutMs?: number;
}

/** What the tenant worker reports: the renewed kids and how many were not due yet. */
export interface DispatchRenewSigningCertificatesResult {
  renewed: string[];
  notDue: number;
}

/**
 * Builds a function that asks one tenant worker to renew its CA-issued
 * signing certificates. Tenant workers in a dispatch namespace have no
 * schedule of their own, so call it for each tenant from the control plane's
 * scheduled handler, at least daily.
 *
 * Rejects when the push fails or the worker returns non-2xx — including 404
 * when that worker has no `signingCertificateAuthority` configured, and 500
 * with the per-key failures when some renewals failed.
 */
export function createDispatchRenewSigningCertificates(
  options: DispatchRenewSigningCertificatesOptions,
): (tenantId: string) => Promise<DispatchRenewSigningCertificatesResult> {
  const {
    dispatcher,
    scriptNameTemplate = DEFAULT_SCRIPT_NAME_TEMPLATE,
    internalSecret,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  return async (tenantId) => {
    const scriptName = fillTemplate(scriptNameTemplate, tenantId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // The timer stays armed through the body read: aborting the signal also
    // cancels a stalled body, so one hung tenant can't hold up the renewal
    // loop past `timeoutMs`.
    try {
      const response = await dispatcher
        .get(scriptName)
        .fetch(`https://tenant.internal${RENEW_PATH}`, {
          method: "POST",
          headers: { authorization: `Bearer ${internalSecret}` },
          signal: controller.signal,
        });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const code = response.headers.get("x-authhero-error");
        throw new Error(
          `signing-certificate renewal for "${scriptName}" failed: ${response.status}` +
            `${code ? ` (${code})` : ""} ${body.slice(0, 512)}`,
        );
      }

      const body: unknown = await response.json();
      if (!isRenewResult(body)) {
        throw new Error(
          `signing-certificate renewal for "${scriptName}" returned an unexpected body`,
        );
      }
      return { renewed: body.renewed, notDue: body.notDue };
    } finally {
      clearTimeout(timer);
    }
  };
}

function isRenewResult(
  value: unknown,
): value is DispatchRenewSigningCertificatesResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "renewed" in value &&
    "notDue" in value &&
    Array.isArray(value.renewed) &&
    value.renewed.every((kid) => typeof kid === "string") &&
    typeof value.notDue === "number"
  );
}
