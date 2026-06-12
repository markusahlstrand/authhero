import { DataAdapters } from "@authhero/adapter-interfaces";
import { getAdapterMethodNames } from "../../src/helpers/adapter-methods";

/**
 * Wraps a {@link DataAdapters} so every method call increments a counter
 * keyed by `${entity}.${method}`. Use to assert that a route flow makes
 * the expected number of adapter calls — a regression guard against
 * inadvertently bypassing the bundle/cache.
 *
 * Returns a `{ wrapped, counts, reset }` triple. `counts` is a live record
 * (mutated as calls happen); `reset()` zeroes it for the next assertion.
 */
export function countingAdapter(data: DataAdapters): {
  wrapped: DataAdapters;
  counts: Record<string, number>;
  reset: () => void;
} {
  const counts: Record<string, number> = {};
  const wrapped: Record<string, unknown> = {};

  for (const [entityName, entity] of Object.entries(data)) {
    if (entity === undefined || entity === null) continue;

    if (typeof entity === "function") {
      // Top-level functions like `transaction`. Wrap so they're counted, but
      // pass through verbatim — the inner trx adapter is NOT counted (it's
      // a separate object, intentionally bypassing this wrapper).
      wrapped[entityName] = (...args: unknown[]) => {
        counts[`${entityName}()`] = (counts[`${entityName}()`] ?? 0) + 1;
        return (entity as (...a: unknown[]) => unknown)(...args);
      };
      continue;
    }

    const entityObj = entity as Record<string, unknown>;
    const wrappedEntity: Record<string, unknown> = {};

    for (const methodName of getAdapterMethodNames(entityObj)) {
      const method = entityObj[methodName];
      if (typeof method !== "function") {
        wrappedEntity[methodName] = method;
        continue;
      }
      wrappedEntity[methodName] = (...args: unknown[]) => {
        const key = `${entityName}.${methodName}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return (method as (...a: unknown[]) => unknown).apply(entity, args);
      };
    }

    wrapped[entityName] = wrappedEntity;
  }

  return {
    wrapped: wrapped as unknown as DataAdapters,
    counts,
    reset: () => {
      for (const k of Object.keys(counts)) delete counts[k];
    },
  };
}
