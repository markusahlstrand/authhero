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
