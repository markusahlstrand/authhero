/**
 * Date conversion utilities for adapters.
 *
 * DB stores timestamps as bigint milliseconds (_ts suffix columns).
 * Adapter interface uses ISO 8601 strings.
 */

export type DbDateField = string | number | null | undefined;

/**
 * Convert a database date field (either format) to an ISO string.
 * Returns undefined if the value is null/undefined/empty.
 */
export function dbDateToIso(value: DbDateField): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    if (value === "") {
      return undefined;
    }

    const numericValue = parseFloat(value);
    if (!isNaN(numericValue) && /^\d+(\.\d+)?$/.test(value)) {
      return new Date(numericValue).toISOString();
    }

    return value;
  }

  return undefined;
}

/**
 * Convert a database date field to ISO string, with a required fallback.
 */
export function dbDateToIsoRequired(
  value: DbDateField,
  fallback: string = new Date(0).toISOString(),
): string {
  return dbDateToIso(value) ?? fallback;
}

/**
 * Convert an ISO string to bigint timestamp for writing to the database.
 */
export function isoToDbDate(
  isoString: string | null | undefined,
): number | null {
  if (!isoString || isoString === "") {
    return null;
  }
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date.getTime();
}

/**
 * Get current timestamp as ISO string.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Convert date fields from DB format to adapter format (ISO strings).
 * Strips the _ts suffix from column names.
 */
export function convertDatesToAdapter<
  T extends Record<string, DbDateField>,
  R extends keyof T,
  O extends keyof T = never,
>(
  row: T,
  requiredColumns: R[],
  optionalColumns: O[] = [] as O[],
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const col of requiredColumns) {
    const outputName = (col as string).replace(/_ts$/, "");
    result[outputName] = dbDateToIsoRequired(row[col]);
  }

  for (const col of optionalColumns) {
    const outputName = (col as string).replace(/_ts$/, "");
    result[outputName] = dbDateToIso(row[col]);
  }

  return result;
}
