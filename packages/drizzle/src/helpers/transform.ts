// The transformation helpers shared with the kysely adapter live in
// @authhero/adapter-interfaces, the canonical home for helpers shared
// between the SQL adapters. Drizzle-specific helpers stay below.
export {
  removeNullProperties,
  stringifyIfDefined,
  stringifyProperties,
  booleanToInt,
  removeUndefinedAndNull,
  getCountAsInt,
} from "@authhero/adapter-interfaces";

/**
 * Parse a JSON string field if it's a string, otherwise return as-is.
 */
export function parseJsonIfString<T = any>(
  value: string | null | undefined,
  fallback?: T,
): T | undefined {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/**
 * Parse multiple JSON string properties on an object.
 */
export function parseJsonProperties<T extends Record<string, any>>(
  obj: T,
  properties: (keyof T)[],
  target: any = { ...obj },
): any {
  for (const prop of properties) {
    if (typeof obj[prop] === "string") {
      try {
        target[prop] = JSON.parse(obj[prop] as string);
      } catch {
        // leave as-is
      }
    }
  }
  return target;
}

/**
 * Flatten a nested object to a flat object with underscore-separated keys.
 */
export function flattenObject(
  obj: Record<string, any>,
  prefix = "",
  res: Record<string, any> = {},
): Record<string, any> {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}_${key}` : key;
      const value = obj[key];
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        flattenObject(value, newKey, res);
      } else if (typeof value === "boolean") {
        res[newKey] = value ? 1 : 0;
      } else {
        res[newKey] = value;
      }
    }
  }
  return res;
}

/**
 * Unflatten a flat object back to nested using known prefixes.
 */
export function unflattenObject(
  flatObj: Record<string, any>,
  prefixes: string[],
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(flatObj)) {
    const matchingPrefix = prefixes.find((prefix) =>
      key.startsWith(`${prefix}_`),
    );

    if (!matchingPrefix) {
      result[key] = value;
    } else {
      const newKey = key.slice(matchingPrefix.length + 1);
      result[matchingPrefix] = {
        ...result[matchingPrefix],
        [newKey]: value,
      };
    }
  }

  return result;
}
