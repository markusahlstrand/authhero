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
