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
      if (
        typeof obj[key] === "object" &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        flattenObject(obj[key], newKey, res);
      } else {
        res[newKey] = obj[key];
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
    let target = result;
    const parts = key.split("_");
    let isPrefixed = false;

    parts.forEach((part, i) => {
      const prefix = parts.slice(0, i + 1).join("_");

      if (prefixes.includes(prefix) && i < parts.length - 1) {
        isPrefixed = true;
        if (!target[part]) {
          target[part] = {};
        }
        target = target[part];
      } else {
        if (i === parts.length - 1) {
          target[part] = value;
        } else {
          if (!target[part]) {
            target[part] = {};
          }
          target = target[part];
        }
      }
    });

    // Handle case where no prefix matched but it's not the last part
    if (!isPrefixed && parts.length > 1) {
      let current = result;

      parts.forEach((part) => {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      });

      current[parts.at(-1)!] = value;
    }
  }

  return result;
}
