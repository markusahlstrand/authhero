/**
 * Configuration for a secondary adapter in passthrough mode.
 */
export interface SecondaryAdapterConfig<T> {
  /**
   * The secondary adapter to sync writes to.
   * Can be a partial implementation - only implemented methods will be called.
   */
  adapter: Partial<T>;

  /**
   * If true, wait for the secondary write to complete before returning.
   * Default: false (fire-and-forget)
   */
  blocking?: boolean;

  /**
   * Called when a secondary write fails.
   * @param error - The error that occurred
   * @param method - The method name that failed
   * @param args - The arguments passed to the method
   */
  onError?: (error: Error, method: string, args: unknown[]) => void;
}

/**
 * Configuration for creating a passthrough adapter that syncs writes to multiple destinations.
 *
 * @template T - The adapter interface type (e.g., LogsDataAdapter, UsersDataAdapter)
 */
export interface PassthroughConfig<T> {
  /**
   * Primary adapter - all reads come from here, writes go here first.
   */
  primary: T;

  /**
   * Secondary adapters to sync writes to.
   */
  secondaries: SecondaryAdapterConfig<T>[];

  /**
   * Methods that should be synced to secondaries.
   * Default: ["create", "update", "remove", "delete", "set"]
   */
  syncMethods?: string[];
}

/**
 * Creates a passthrough adapter that syncs write operations to multiple destinations.
 *
 * Reads always come from the primary adapter.
 * Writes go to the primary first, then are synced to all secondaries.
 *
 * @example Logs adapter with database primary and Analytics Engine secondary
 * ```typescript
 * import { createPassthroughAdapter } from "@authhero/adapter-interfaces";
 *
 * const logsAdapter = createPassthroughAdapter({
 *   primary: databaseLogsAdapter,
 *   secondaries: [
 *     {
 *       adapter: analyticsEngineAdapter,
 *       onError: (err) => console.error("Analytics sync failed:", err),
 *     },
 *   ],
 * });
 * ```
 *
 * @example Cache adapter with multiple backends
 * ```typescript
 * const cacheAdapter = createPassthroughAdapter({
 *   primary: redisCacheAdapter,
 *   secondaries: [
 *     { adapter: memcachedAdapter, blocking: true },
 *     { adapter: localCacheAdapter },
 *   ],
 *   syncMethods: ["set", "delete"],
 * });
 * ```
 *
 * @example Users adapter with search index sync
 * ```typescript
 * const usersAdapter = createPassthroughAdapter({
 *   primary: databaseUsersAdapter,
 *   secondaries: [
 *     {
 *       adapter: elasticsearchAdapter,
 *       blocking: true, // Wait for search index to update
 *     },
 *   ],
 * });
 * ```
 */
export function createPassthroughAdapter<T extends object>(
  config: PassthroughConfig<T>,
): T {
  const {
    primary,
    secondaries,
    syncMethods = ["create", "update", "remove", "delete", "set"],
  } = config;

  const handler: ProxyHandler<T> = {
    get(target, prop: string | symbol) {
      // Handle symbol properties (like Symbol.toStringTag)
      if (typeof prop === "symbol") {
        return (target as Record<symbol, unknown>)[prop];
      }

      const primaryValue = (target as Record<string, unknown>)[prop];

      // If it's not a function, just return the primary's value
      if (typeof primaryValue !== "function") {
        return primaryValue;
      }

      // If it's not a sync method, just use primary
      if (!syncMethods.includes(prop)) {
        return primaryValue.bind(target);
      }

      // For sync methods, wrap to also call secondaries
      return async (...args: unknown[]) => {
        // Call primary first and wait for result
        const result = await primaryValue.apply(target, args);

        // Sync to secondaries
        const blockingPromises: Promise<void>[] = [];

        for (const secondary of secondaries) {
          const secondaryMethod = (
            secondary.adapter as Record<string, unknown>
          )[prop];

          if (typeof secondaryMethod !== "function") {
            continue;
          }

          const syncPromise = (async () => {
            try {
              await secondaryMethod.apply(secondary.adapter, args);
            } catch (error) {
              if (secondary.onError) {
                secondary.onError(error as Error, prop, args);
              } else {
                console.error(
                  `Passthrough adapter: secondary write failed for ${prop}:`,
                  error,
                );
              }
            }
          })();

          if (secondary.blocking) {
            blockingPromises.push(syncPromise);
          }
        }

        // Wait for blocking secondaries
        if (blockingPromises.length > 0) {
          await Promise.all(blockingPromises);
        }

        return result;
      };
    },
  };

  return new Proxy(primary, handler);
}

/**
 * Creates a write-only adapter that only implements specific methods.
 * Useful for creating secondary adapters that only need to handle synced writes.
 *
 * @example
 * ```typescript
 * const webhookNotifier = createWriteOnlyAdapter<LogsDataAdapter>({
 *   create: async (tenantId, log) => {
 *     await fetch("https://webhook.example.com/logs", {
 *       method: "POST",
 *       body: JSON.stringify({ tenantId, log }),
 *     });
 *   },
 * });
 *
 * const logsAdapter = createPassthroughAdapter({
 *   primary: databaseLogsAdapter,
 *   secondaries: [{ adapter: webhookNotifier }],
 * });
 * ```
 */
export function createWriteOnlyAdapter<T>(
  implementation: Partial<T>,
): Partial<T> {
  return implementation;
}
