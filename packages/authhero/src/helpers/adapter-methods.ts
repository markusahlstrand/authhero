/**
 * Returns the names of every callable-ish property on `adapter`, including
 * those inherited from prototypes. `Object.entries` / `Object.keys` skip
 * prototype methods, so iterating with those alone silently strips methods
 * off class-based adapters (e.g. CloudflareRateLimit, CloudflareCache),
 * leaving callers staring at `TypeError: foo.consume is not a function`
 * even though the original instance had the method.
 *
 * Walks up to (but not including) `Object.prototype` so we don't surface
 * `hasOwnProperty` and friends, and filters out `constructor`.
 */
export function getAdapterMethodNames(
  adapter: Record<string, unknown>,
): string[] {
  const names = new Set<string>();
  let cur: object | null = adapter;
  while (cur && cur !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(cur)) {
      if (name === "constructor") continue;
      names.add(name);
    }
    cur = Object.getPrototypeOf(cur);
  }
  return Array.from(names);
}
