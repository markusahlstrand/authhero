/**
 * Converts an iterable object (like Headers, URLSearchParams) to a plain JSON object.
 * This is useful for serializing objects that don't naturally serialize to JSON.
 *
 * @param instance - An iterable object where each item is a [key, value] pair
 * @returns A plain object with the key-value pairs
 */
export function instanceToJson<T = string>(
  instance: Headers | URLSearchParams | Iterable<[string, T]>,
): Record<string, T> {
  return [...(instance as Iterable<[string, T]>)].reduce(
    (obj, [key, value]) => ({ ...obj, [key]: value }),
    {} as Record<string, T>,
  );
}
