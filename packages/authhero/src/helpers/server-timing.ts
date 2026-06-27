import { Context, MiddlewareHandler } from "hono";
import { CacheAdapter, DataAdapters } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { getAdapterMethodNames } from "./adapter-methods";
import { ensureMutableResponse } from "./mutable-response";

type TimingCtx = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Record one Server-Timing measurement on the request-scoped buffer
 * (`ctx.var.serverTiming`). The measurement is NOT written to the response
 * header here — {@link serverTimingMiddleware} decides at the end of the
 * request whether to emit it to the client, log it server-side, or drop it.
 * Used by the adapter wrappers below and by the webhook hook.
 */
export function recordServerTiming(
  ctx: TimingCtx,
  name: string,
  duration: number,
): void {
  const entries = ctx.get("serverTiming");
  if (entries) {
    entries.push({ name, dur: duration });
  } else {
    ctx.set("serverTiming", [{ name, dur: duration }]);
  }
}

function isIpAllowed(ip: string | undefined, allowlist: string): boolean {
  if (!ip) return false;
  return allowlist
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(ip);
}

/**
 * Flushes the request-scoped Server-Timing buffer according to the
 * `SERVER_TIMING` env. Mount this right after `applyConfigMiddleware` so that
 * env is populated before it runs and the client `ip` is resolved by the time
 * `next()` returns.
 *
 * Sinks (see {@link Bindings.SERVER_TIMING}):
 *   - "off"/unset → drop the buffer (default; nothing reaches the client).
 *   - "client"    → set the `Server-Timing` header, optionally gated to
 *                   `SERVER_TIMING_IPS`.
 *   - "log"       → emit a structured log line; never sent to the client.
 *   - "both"      → both of the above.
 *
 * Off by default because per-operation timings on the public auth endpoints are
 * a user-enumeration / side-channel surface.
 */
export const serverTimingMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (ctx, next) => {
  await next();

  const mode = ctx.env.SERVER_TIMING ?? "off";
  if (mode === "off") return;

  const entries = ctx.get("serverTiming");
  if (!entries || entries.length === 0) return;

  const header = entries
    .map((e) => `${e.name};dur=${e.dur.toFixed(2)}`)
    .join(", ");

  if (mode === "log" || mode === "both") {
    console.log(
      JSON.stringify({
        msg: "server-timing",
        method: ctx.req.method,
        path: ctx.req.path,
        ip: ctx.get("ip"),
        tenant_id: ctx.get("tenant_id"),
        timing: header,
      }),
    );
  }

  if (mode === "client" || mode === "both") {
    const allowlist = ctx.env.SERVER_TIMING_IPS;
    if (!allowlist || isIpAllowed(ctx.get("ip"), allowlist)) {
      // The response may have come back from a dispatch/`fetch()` with immutable
      // headers — normalize before writing.
      ensureMutableResponse(ctx);
      const existing = ctx.res.headers.get("Server-Timing");
      ctx.res.headers.set(
        "Server-Timing",
        existing ? `${existing}, ${header}` : header,
      );
    }
  }
};

/**
 * The prefix segment of a cache key — everything before the first ":". Cache
 * keys look like `client-bundle:<tenant>:<client>` or
 * `customText:get:["<tenant>",…]`, so the prefix is the bundle name or the
 * entity name. Only this prefix is emitted, never the full key, so tenant /
 * client ids and serialised query args stay out of the response header.
 */
function cacheLabel(key: string): string {
  if (!key) return "unknown";
  const colon = key.indexOf(":");
  return colon === -1 ? key : key.slice(0, colon);
}

/**
 * Wraps a {@link CacheAdapter} so each operation appends a Server-Timing entry
 * labelled by the key's prefix, e.g. `cache-get:client-bundle`,
 * `cache-get:customText`. The cache layers call this adapter directly — not
 * through the timed data stack — so on Workers the Cache API `match()` / `put()`
 * round-trips would otherwise be invisible. This makes that latency observable
 * without exposing the full (id-bearing) cache key.
 */
export function addCacheTimingLogs(
  ctx: TimingCtx,
  cache: CacheAdapter,
): CacheAdapter {
  const time = async <T>(metric: string, op: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    try {
      return await op();
    } finally {
      recordServerTiming(ctx, metric, performance.now() - start);
    }
  };

  return {
    get<T = unknown>(key: string): Promise<T | null> {
      return time(`cache-get:${cacheLabel(key)}`, () => cache.get<T>(key));
    },
    set<T = unknown>(
      key: string,
      value: T,
      ttlSeconds?: number,
    ): Promise<void> {
      return time(`cache-set:${cacheLabel(key)}`, () =>
        cache.set<T>(key, value, ttlSeconds),
      );
    },
    delete(key: string): Promise<boolean> {
      return time(`cache-delete:${cacheLabel(key)}`, () => cache.delete(key));
    },
    deleteByPrefix(prefix: string): Promise<number> {
      return time(`cache-deleteByPrefix:${cacheLabel(prefix)}`, () =>
        cache.deleteByPrefix(prefix),
      );
    },
    clear(): Promise<void> {
      return time("cache-clear", () => cache.clear());
    },
  };
}

/**
 * Adds server-timing middleware logging to all adapter methods
 * This wraps each method of the data adapter to measure its execution time
 * and adds it to the server-timing header
 */
export function addTimingLogs(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): DataAdapters {
  const wrappedAdapters: Record<string, any> = {};

  // Process each adapter
  for (const [adapterName, adapter] of Object.entries(data)) {
    // Skip undefined optional adapters (e.g., geo, cache)
    if (adapter === undefined || adapter === null) {
      continue;
    }

    // Pass through top-level functions (e.g., transaction, sessionCleanup)
    if (typeof adapter === "function") {
      wrappedAdapters[adapterName] = adapter;
      continue;
    }

    const wrappedAdapter: Record<string, any> = {};

    // Process each method in the adapter. Includes prototype methods so
    // class-based adapters (e.g. CloudflareRateLimit) don't have their
    // methods silently stripped.
    for (const methodName of getAdapterMethodNames(
      adapter as Record<string, unknown>,
    )) {
      const method = (adapter as Record<string, any>)[methodName];
      if (typeof method === "function") {
        // Bind to the original adapter so methods that reference `this`
        // (class instances) keep working after the wrap.
        const bound = method.bind(adapter);
        // Wrap the method with timing measurement
        wrappedAdapter[methodName] = async (...args: any[]) => {
          const startTime = performance.now();
          try {
            // Call the original method
            const result = await bound(...args);
            recordServerTiming(
              ctx,
              `${adapterName}-${methodName}`,
              performance.now() - startTime,
            );
            return result;
          } catch (error) {
            // Add timing even for failed operations
            recordServerTiming(
              ctx,
              `${adapterName}-${methodName}-error`,
              performance.now() - startTime,
            );
            throw error;
          }
        };
      } else {
        // For non-function properties, just copy them as is
        wrappedAdapter[methodName] = method;
      }
    }

    wrappedAdapters[adapterName] = wrappedAdapter;
  }

  return wrappedAdapters as DataAdapters;
}
