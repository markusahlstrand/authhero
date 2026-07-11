/**
 * Row/entity transformation helpers shared by the SQL adapters (kysely,
 * drizzle). They convert between the adapter interface's rich entity shapes
 * (nested objects, booleans, optional fields) and the flat SQL row shapes
 * (JSON strings, 0/1 integers, no undefined values).
 */

/**
 * Stringify a value to JSON if it's defined, otherwise return undefined.
 * This is useful for converting objects to JSON strings for database storage.
 */
export function stringifyIfDefined<T>(
  value: T | undefined,
): string | undefined {
  return value !== undefined ? JSON.stringify(value) : undefined;
}

/**
 * Stringify multiple properties of an object to JSON strings.
 * Only properties that are defined will be stringified.
 *
 * @param obj - The source object containing properties to stringify
 * @param properties - Array of property names to stringify
 * @param target - The target object to write stringified values to (defaults to a new object based on obj)
 * @returns The target object with stringified properties
 *
 * @example
 * const source = { flags: { enabled: true }, sessions: { timeout: 300 }, name: "Test" };
 * const result = stringifyProperties(source, ['flags', 'sessions']);
 * // result = { flags: '{"enabled":true}', sessions: '{"timeout":300}', name: "Test" }
 */
export function stringifyProperties<T extends Record<string, any>>(
  obj: T,
  properties: (keyof T)[],
  target: any = { ...obj },
): any {
  for (const prop of properties) {
    if (obj[prop] !== undefined) {
      target[prop] = JSON.stringify(obj[prop]);
    }
  }
  return target;
}

/**
 * Convert boolean properties to integers (1 for true, 0 for false).
 * Only properties that are defined will be converted.
 *
 * @param source - The source object containing boolean properties to convert
 * @param properties - Array of property names to convert
 * @param target - The target object to write integer values to (defaults to source)
 *
 * @example
 * const source = { enabled: true, active: false, name: "Test" };
 * const result = {};
 * booleanToInt(source, ['enabled', 'active'], result);
 * // result = { enabled: 1, active: 0 }
 */
export function booleanToInt<T extends Record<string, any>>(
  source: Partial<T>,
  properties: (keyof T)[],
  target: any = source,
): void {
  for (const property of properties) {
    if (source[property] !== undefined) {
      target[property] = source[property] ? 1 : 0;
    }
  }
}

/**
 * Remove undefined and null properties from an object.
 * This keeps the SQL payload clean by only including defined values.
 */
export function removeUndefinedAndNull<T extends Record<string, any>>(
  obj: T,
): Partial<T> {
  const cleaned: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined && obj[key] !== null) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}

/**
 * Remove null properties from an object recursively. Used when mapping SQL
 * rows (where missing values are NULL) back to adapter entities (where they
 * are absent).
 */
export function removeNullProperties<T = any>(obj: unknown): T {
  // Return primitives and null/undefined as-is
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      // Only recurse into objects; leave primitives untouched
      item !== null && typeof item === "object"
        ? removeNullProperties(item)
        : item,
    ) as T;
  }

  const clone: Record<string, any> = { ...(obj as Record<string, any>) };

  for (const key in clone) {
    const val = clone[key];
    if (val === null) {
      delete clone[key];
    } else if (val !== null && typeof val === "object") {
      if (Array.isArray(val)) {
        clone[key] = val.map((item: unknown) =>
          item !== null && typeof item === "object"
            ? removeNullProperties(item)
            : item,
        );
      } else {
        clone[key] = removeNullProperties(val);
      }
    }
  }

  return clone as T;
}

/**
 * Get a COUNT(*) result as an integer regardless of how the DB driver
 * returns it (string, number, or bigint).
 */
export function getCountAsInt(count: string | number | bigint): number {
  if (typeof count === "string") {
    return parseInt(count, 10);
  }
  if (typeof count === "bigint") {
    return Number(count);
  }
  return count;
}
