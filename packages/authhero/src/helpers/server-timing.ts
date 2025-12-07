import { Context } from "hono";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";

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

    const wrappedAdapter: Record<string, any> = {};

    // Process each method in the adapter
    for (const [methodName, method] of Object.entries(
      adapter as Record<string, any>,
    )) {
      if (typeof method === "function") {
        // Wrap the method with timing measurement
        wrappedAdapter[methodName] = async (...args: any[]) => {
          const startTime = performance.now();
          try {
            // Call the original method
            const result = await method(...args);
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
