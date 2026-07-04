/**
 * Deterministic engine instance id for a tenant operation:
 * `op-{kind}-{tenantSegment}-{operationId}`.
 *
 * Uses dashes (Cloudflare Workflows instance ids only allow
 * `[a-zA-Z0-9_-]`) and stays ≤ 64 characters by truncating the tenant
 * segment — never the operation id, which alone guarantees uniqueness.
 * Deterministic so an engine handle can be re-derived from the operation
 * row (e.g. by the reconciler) without any lookup.
 */
const MAX_INSTANCE_ID_LENGTH = 64;

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function buildEngineInstanceId(operation: {
  kind: string;
  tenant_id: string | null;
  id: string;
}): string {
  const kind = sanitizeSegment(operation.kind);
  const operationId = sanitizeSegment(operation.id);
  const fixedLength = "op-".length + kind.length + 2 + operationId.length;
  const tenantBudget = Math.max(0, MAX_INSTANCE_ID_LENGTH - fixedLength);
  const tenant = sanitizeSegment(operation.tenant_id ?? "fleet").slice(
    0,
    tenantBudget,
  );
  return `op-${kind}-${tenant}-${operationId}`.slice(0, MAX_INSTANCE_ID_LENGTH);
}
