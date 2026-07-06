import { CloudflareApiClient } from "../wfp-provisioner/cf-api";
import { escapeSqlLiteral } from "../wfp-provisioner/provisioner-steps";

export interface ProvisionVerifierOptions {
  client: CloudflareApiClient;
  /** Minimum number of signing keys the tenant D1 must hold. Default 1. */
  minKeys?: number;
}

/**
 * Thrown when the freshly provisioned D1 fails the post-seed checks. The
 * message is self-contained (it survives workflow step serialization) and
 * names exactly which check failed — it ends up in
 * `tenant_operation_events.detail` and, when retries exhaust, in
 * `tenants.provisioning_error`.
 */
export class TenantProvisionVerificationError extends Error {
  readonly checks: { keyCount: number; tenantRowCount: number };

  constructor(
    message: string,
    checks: { keyCount: number; tenantRowCount: number },
  ) {
    super(message);
    this.name = "TenantProvisionVerificationError";
    this.checks = checks;
  }
}

function readCount(result: { results?: unknown[] }[], column: string): number {
  for (const block of result) {
    for (const row of block.results ?? []) {
      if (!row || typeof row !== "object") continue;
      for (const [key, value] of Object.entries(row)) {
        if (key !== column) continue;
        if (typeof value === "number") return value;
        if (typeof value === "string" && value !== "" && !isNaN(Number(value)))
          return Number(value);
      }
    }
  }
  return 0;
}

/**
 * Post-provision verification (issue #1026): assert the tenant D1 actually
 * contains signing keys and its own tenant row before the tenant is marked
 * `ready`. Queries D1 over the same REST path the provisioner's migrations
 * use — this is what turns the 2026-07-02 "ready but empty D1" incident
 * class into a retried workflow step instead of a silent success.
 *
 * Limitation (accepted for v1): this proves the rows landed in D1 via the
 * REST API, not that the tenant worker's binding observes them; a worker
 * HTTP probe can be layered on later.
 */
export function createProvisionVerifier(
  options: ProvisionVerifierOptions,
): (databaseId: string, tenantId: string) => Promise<void> {
  const minKeys = options.minKeys ?? 1;

  return async (databaseId: string, tenantId: string): Promise<void> => {
    const result = await options.client.execD1(
      databaseId,
      `SELECT (SELECT COUNT(*) FROM keys) AS key_count, (SELECT COUNT(*) FROM tenants WHERE id = '${escapeSqlLiteral(tenantId)}') AS tenant_count;`,
    );

    const keyCount = readCount(result, "key_count");
    const tenantRowCount = readCount(result, "tenant_count");

    const failures: string[] = [];
    if (keyCount < minKeys) {
      failures.push(
        `expected at least ${minKeys} signing key(s) in "keys", found ${keyCount}`,
      );
    }
    if (tenantRowCount < 1) {
      failures.push(`tenant row "${tenantId}" missing from "tenants"`);
    }

    if (failures.length > 0) {
      throw new TenantProvisionVerificationError(
        `Tenant D1 verification failed for "${tenantId}": ${failures.join("; ")}`,
        { keyCount, tenantRowCount },
      );
    }
  };
}
