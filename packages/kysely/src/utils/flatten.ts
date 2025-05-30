import { z } from "@hono/zod-openapi";

export function flattenSchema(schema: any, prefix = "_") {
  let result: any = {};

  for (const key in schema.shape) {
    const field = schema.shape[key];
    const fullPath = prefix ? `${prefix}_${key}` : key;

    if (field instanceof z.ZodObject) {
      result = { ...result, ...flattenSchema(field, fullPath) };
    } else {
      result[fullPath] = field;
    }
  }

  return z.object(result);
}

export function flattenObject(obj, prefix = "", res = {}) {
  for (let key in obj) {
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

export function unflattenObject(
  flatObj: { [key: string]: any },
  prefixes: string[],
): { [key: string]: any } {
  const result: { [key: string]: any } = {};

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
