import { z } from "@hono/zod-openapi";

// Returns a `z.ZodObject<z.ZodRawShape>` whose precise key/value map only
// exists at runtime. Call sites that need the flattened fields available on
// the inferred type chain it with `.extend({...})` and then re-derive the
// shape from the chain, or simply use the returned schema for parsing.
export function flattenSchema(
  schema: z.ZodObject<z.ZodRawShape>,
  prefix = "_",
): z.ZodObject<z.ZodRawShape> {
  const result: Record<string, z.ZodTypeAny> = {};

  function walk(s: z.ZodObject<z.ZodRawShape>, p: string) {
    for (const key in s.shape) {
      const field = s.shape[key] as z.ZodTypeAny;
      const fullPath = p ? `${p}_${key}` : key;
      if (field instanceof z.ZodObject) {
        walk(field as z.ZodObject<z.ZodRawShape>, fullPath);
      } else {
        result[fullPath] = field;
      }
    }
  }
  walk(schema, prefix);

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
