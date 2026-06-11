import { DataAdapters } from "@authhero/adapter-interfaces";
import { getAdapterMethodNames } from "./adapter-methods";

/**
 * Wraps a DataAdapters with per-request in-flight Promise memoization for
 * a specific set of entities.
 *
 * For each entity in `options.dedupEntities`, every read method has its
 * Promise stored in a Map keyed on (method, args); concurrent or sequential
 * repeat calls with the same args reuse that Promise. Write methods on the
 * same entity invalidate its entries so subsequent reads see fresh data.
 *
 * IMPORTANT: dedup is opt-in by entity. Entities that may be mutated via the
 * transactional adapter (`ctx.env.data.transaction((trx) => …)`) MUST NOT be
 * deduped here — `trx` writes bypass this wrapper, so a memoized Promise
 * captured before the transaction would survive past it and serve stale data
 * to any later read in the same isolate. In practice this means: dedup the
 * same set we cache cross-request in {@link addCaching}. Those are stable
 * config rows with no transactional write paths.
 *
 * Scope: a fresh Map per call. Pass a new one per request (e.g. from a Hono
 * middleware) so memoization dies with the request.
 *
 * Compared to {@link addCaching}: no TTL, no serialization, no network. This
 * exists to eliminate duplicate calls *within* a single request — the cross-
 * request cache is still {@link addCaching}'s job.
 */

const WRITE_PREFIXES = [
  "create",
  "update",
  "remove",
  "delete",
  "set",
  "used",
  "add",
];

function isWriteMethod(methodName: string): boolean {
  return WRITE_PREFIXES.some((p) => methodName.startsWith(p));
}

function dedupKey(adapter: string, method: string, args: unknown[]): string {
  try {
    return `${adapter}:${method}:${JSON.stringify(args)}`;
  } catch {
    // Args contain a circular reference; skip memoization for this call.
    return "";
  }
}

export interface RequestScopedDedupOptions {
  /** Names of adapter entities to dedup. Entities outside this list pass through verbatim. Required — there is no safe default. */
  dedupEntities: string[];
  /** Shared Map for memoized Promises. Defaults to a fresh Map per call. */
  dedup?: Map<string, Promise<unknown>>;
}

export function addRequestScopedDedup(
  data: DataAdapters,
  options: RequestScopedDedupOptions,
): DataAdapters {
  const dedup = options.dedup ?? new Map<string, Promise<unknown>>();
  const dedupSet = new Set(options.dedupEntities);
  const wrapped: Record<string, unknown> = {};

  for (const [adapterName, adapter] of Object.entries(data)) {
    if (adapter === undefined || adapter === null) continue;

    if (typeof adapter === "function") {
      wrapped[adapterName] = adapter;
      continue;
    }

    // Entities not opted in pass through untouched.
    if (!dedupSet.has(adapterName)) {
      wrapped[adapterName] = adapter;
      continue;
    }

    const wrappedAdapter: Record<string, unknown> = {};
    const entity = adapter as Record<string, unknown>;

    for (const methodName of getAdapterMethodNames(entity)) {
      const method = entity[methodName];
      if (typeof method !== "function") {
        wrappedAdapter[methodName] = method;
        continue;
      }

      const isWrite = isWriteMethod(methodName);

      if (isWrite) {
        wrappedAdapter[methodName] = async (...args: unknown[]) => {
          const result = await (method as (...a: unknown[]) => unknown).apply(
            adapter,
            args,
          );
          // Drop every memoized entry for this adapter — the write may have
          // affected any of them. Cheap and correct.
          for (const key of dedup.keys()) {
            if (key.startsWith(`${adapterName}:`)) dedup.delete(key);
          }
          return result;
        };
        continue;
      }

      wrappedAdapter[methodName] = (...args: unknown[]) => {
        const key = dedupKey(adapterName, methodName, args);
        if (!key) {
          return (method as (...a: unknown[]) => unknown).apply(adapter, args);
        }

        const cached = dedup.get(key);
        if (cached) return cached;

        const promise = (async () => {
          try {
            return await (method as (...a: unknown[]) => unknown).apply(
              adapter,
              args,
            );
          } catch (err) {
            // Don't keep a rejected promise around — next caller should retry.
            dedup.delete(key);
            throw err;
          }
        })();
        dedup.set(key, promise);
        return promise;
      };
    }

    wrapped[adapterName] = wrappedAdapter;
  }

  return wrapped as unknown as DataAdapters;
}
