/**
 * Minimal, `as`-free helpers for reading fields off the `unknown` rows carried
 * in an export stream. Import code only needs to pluck a handful of string
 * fields (id columns + timestamps) to reconstruct `importMetadata`; the full
 * row is forwarded to the adapter as the typed insert payload after a single
 * narrowing step.
 */

/** Narrow an unknown value to a plain record, or `undefined` if it isn't one. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      out[key] = fieldValue;
    }
    return out;
  }
  return undefined;
}

/** Read a string field off an unknown row, or `undefined` when absent. */
export function getString(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  const field = record?.[key];
  return typeof field === "string" ? field : undefined;
}

/**
 * Return a shallow copy of an unknown row with `null`/`undefined` top-level
 * fields removed. Export rows are full entities whose optional enum/object
 * columns are often serialized as `null`; the matching *Insert* zod schemas
 * mark those fields optional (not nullable), so they reject a present-but-null
 * value. Dropping nullish keys lets a faithful row parse cleanly while keeping
 * every real value intact.
 */
export function withoutNullish(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(record)) {
    if (fieldValue !== null && fieldValue !== undefined) {
      out[key] = fieldValue;
    }
  }
  return out;
}
