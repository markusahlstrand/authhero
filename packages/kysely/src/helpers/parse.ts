/**
 * Parse a JSON string if defined, otherwise return the default value.
 * This is useful for parsing JSON strings from database storage.
 */
export function parseJsonIfDefined<T>(
  value: string | null | undefined,
  defaultValue: T,
): T {
  if (!value) {
    return defaultValue;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Parse a JSON metadata blob from the database. Returns the parsed value
 * only if it's a plain object (rejects arrays, primitives, and parse errors)
 * — those would be corruption or legacy rows we don't want to crash on.
 */
export function parseJsonObjectIfDefined(
  value: string | null | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse multiple JSON string properties of an object.
 * Properties that are undefined or null will use their default values.
 *
 * @param obj - The source object containing JSON string properties to parse
 * @param propertyDefaults - Map of property names to their default values
 * @param target - The target object to write parsed values to (defaults to a new object based on obj)
 * @returns The target object with parsed properties
 *
 * @example
 * const source = { flags: '{"enabled":true}', sessions: null, name: "Test" };
 * const result = parseJsonProperties(source, { flags: {}, sessions: {} });
 * // result = { flags: {enabled: true}, sessions: {}, name: "Test" }
 */
export function parseJsonProperties<T extends Record<string, any>>(
  obj: T,
  propertyDefaults: Partial<Record<keyof T, any>>,
  target: any = { ...obj },
): any {
  for (const prop in propertyDefaults) {
    if (prop in obj) {
      target[prop] = parseJsonIfDefined(
        obj[prop] as any,
        propertyDefaults[prop],
      );
    }
  }
  return target;
}
