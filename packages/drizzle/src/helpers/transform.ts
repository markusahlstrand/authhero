/**
 * Remove null properties from an object recursively.
 */
export function removeNullProperties<T = any>(obj: unknown): T {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
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
 * Stringify a value to JSON if it's defined, otherwise return undefined.
 */
export function stringifyIfDefined<T>(
  value: T | undefined,
): string | undefined {
  return value !== undefined ? JSON.stringify(value) : undefined;
}

/**
 * Stringify multiple properties of an object to JSON strings.
 * Only properties that are defined will be stringified.
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

/**
 * Get count as integer from various DB return types.
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
