import { Context } from "hono";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { getAdapterMethodNames } from "./adapter-methods";

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
            const endTime = performance.now();
            const duration = endTime - startTime;

            // Add timing to server-timing header
            const existingHeader = ctx.res.headers.get("Server-Timing") || "";
            const newHeader = existingHeader
              ? `${existingHeader}, ${adapterName}-${methodName};dur=${duration.toFixed(2)}`
              : `${adapterName}-${methodName};dur=${duration.toFixed(2)}`;

            ctx.res.headers.set("Server-Timing", newHeader);

            return result;
          } catch (error) {
            const endTime = performance.now();
            const duration = endTime - startTime;

            // Add timing even for failed operations
            const existingHeader = ctx.res.headers.get("Server-Timing") || "";
            const newHeader = existingHeader
              ? `${existingHeader}, ${adapterName}-${methodName}-error;dur=${duration.toFixed(2)}`
              : `${adapterName}-${methodName}-error;dur=${duration.toFixed(2)}`;

            ctx.res.headers.set("Server-Timing", newHeader);

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
