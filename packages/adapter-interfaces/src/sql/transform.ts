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
type StringifiedProperties<T, K extends keyof T> = {
  [P in keyof T]: P extends K
    ? undefined extends T[P]
      ? string | undefined
      : string
    : T[P];
};

export function stringifyProperties<
  T extends Record<string, unknown>,
  K extends keyof T & string,
>(obj: T, properties: K[]): StringifiedProperties<T, K>;
export function stringifyProperties<
  T extends Record<string, unknown>,
  U extends Record<string, unknown>,
>(obj: T, properties: (keyof T & string)[], target: U): U;
export function stringifyProperties(
  obj: Record<string, unknown>,
  properties: string[],
  target: Record<string, unknown> = { ...obj },
): Record<string, unknown> {
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
export function booleanToInt<T extends Record<string, unknown>>(
  source: Partial<T>,
  properties: (keyof T & string)[],
  target: Record<string, unknown> = source,
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
export function removeUndefinedAndNull<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  // Object.entries/fromEntries only touch own enumerable keys and create
  // plain data properties, so an own `__proto__` key cannot pollute the
  // prototype of the returned object.
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  ) as Partial<T>;
}

/**
 * Remove null properties from an object recursively. Used when mapping SQL
 * rows (where missing values are NULL) back to adapter entities (where they
 * are absent).
 */
export function removeNullProperties<T>(obj: unknown): T {
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

  // Leave non-plain objects (Date, Buffer, driver-specific classes) untouched:
  // spreading them into a plain object would silently corrupt them.
  const prototype = Object.getPrototypeOf(obj);
  if (prototype !== Object.prototype && prototype !== null) {
    return obj as T;
  }

  // Object.entries/fromEntries only touch own enumerable keys and create
  // plain data properties, so an own `__proto__` key cannot pollute the
  // prototype of the returned object.
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [
        key,
        typeof value === "object" ? removeNullProperties(value) : value,
      ]),
  ) as T;
}

/**
 * Get a COUNT(*) result as an integer regardless of how the DB driver
 * returns it (string, number, or bigint).
 */
export function getCountAsInt(count: string | number | bigint): number {
  const value = Number(count);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `COUNT result is not a safe integer: ${String(count)}`,
    );
  }
  return value;
}
