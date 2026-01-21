/**
 * Date conversion utilities for adapters that support BOTH formats during migration:
 * - Old format: varchar(35) ISO 8601 strings (e.g., "2024-01-15T10:30:00.000Z")
 * - New format: bigint Unix timestamps in milliseconds (e.g., 1705315800000)
 *
 * The adapter interface always uses ISO strings, so we convert:
 * - On READ: Detect format and convert to ISO string
 * - On WRITE: Write as bigint timestamp (new format)
 *
 * This allows zero-downtime migration where:
 * 1. Deploy code that reads both formats, writes new format
 * 2. Run migration to convert existing data
 * 3. (Optional) Remove old format support after migration completes
 */

/**
 * Type for a date field that could be either format from the database
 */
export type DbDateField = string | number | null | undefined;

/**
 * Convert a database date field (either format) to an ISO string for the adapter interface
 * Returns undefined if the value is null/undefined/empty
 */
export function dbDateToIso(value: DbDateField): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  // Handle numeric value (bigint timestamp)
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  // Handle string values
  if (typeof value === "string") {
    if (value === "") {
      return undefined;
    }

    // Check if it's a numeric string (bigint stored as string by some DB drivers)
    // This handles cases like "1609459200000" or "1609459200000.0"
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue) && /^\d+(\.\d+)?$/.test(value)) {
      return new Date(numericValue).toISOString();
    }

    // It's already an ISO string
    return value;
  }

  return undefined;
}

/**
 * Convert a database date field to ISO string, with a required fallback
 * Use this for non-nullable date fields like created_at
 */
export function dbDateToIsoRequired(
  value: DbDateField,
  fallback: string = new Date(0).toISOString(),
): string {
  return dbDateToIso(value) ?? fallback;
}

/**
 * Convert an ISO string from the adapter interface to the NEW format (bigint timestamp)
 * for writing to the database
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
 * Get current timestamp as ISO string (for adapter interface)
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Convert date fields from DB format to adapter format (ISO strings)
 * Strips the _ts suffix from column names (e.g., created_at_ts -> created_at)
 * @param row - The database row object
 * @param requiredColumns - Columns that must have a value (will use fallback if null)
 * @param optionalColumns - Columns that can be undefined
 * @returns Object with converted date fields (with _ts suffix stripped)
 */
export function convertDatesToAdapter<
  T extends Record<string, DbDateField>,
  R extends keyof T,
  O extends keyof T = never
>(
  row: T,
  requiredColumns: R[],
  optionalColumns: O[] = [] as O[],
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const col of requiredColumns) {
    // Strip _ts suffix from column name for adapter output
    const outputName = (col as string).replace(/_ts$/, "");
    result[outputName] = dbDateToIsoRequired(row[col]);
  }

  for (const col of optionalColumns) {
    // Strip _ts suffix from column name for adapter output
    const outputName = (col as string).replace(/_ts$/, "");
    result[outputName] = dbDateToIso(row[col]);
  }

  return result;
}

