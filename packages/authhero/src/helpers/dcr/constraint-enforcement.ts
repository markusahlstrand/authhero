import { isPlainObject } from "@authhero/adapter-interfaces";

export interface ConstraintViolation {
  field: string;
  expected: unknown;
  got: unknown;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

export interface ConstraintResult {
  ok: boolean;
  violation?: ConstraintViolation;
  /**
   * Request merged with any absent constrained fields filled in from the
   * constraints. Returned as a loose record since constraints may include
   * fields beyond the typed request schema (e.g. AuthHero-internal
   * `domain`, `integration_type` for the Phase 4 /connect/start flow).
   */
  filled: Record<string, unknown>;
}

/**
 * Enforce IAT-pre-bound metadata constraints on a registration request.
 *
 * Rule per plan: each constrained field must either be absent from the
 * request (filled in from the constraint) or exactly equal. No merging,
 * no subset matching.
 */
export function enforceConstraints(
  constraints: Record<string, unknown> | undefined,
  request: Readonly<Record<string, unknown>>,
): ConstraintResult {
  const filled: Record<string, unknown> = { ...request };
  if (!constraints) {
    return { ok: true, filled };
  }

  for (const [field, expected] of Object.entries(constraints)) {
    const requestValue = request[field];
    if (requestValue === undefined) {
      filled[field] = expected;
      continue;
    }
    if (!deepEqual(requestValue, expected)) {
      return {
        ok: false,
        violation: { field, expected, got: requestValue },
        filled,
      };
    }
  }

  return { ok: true, filled };
}
