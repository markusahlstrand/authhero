import { ActionsAdapter } from "@authhero/adapter-interfaces";

/**
 * Stub actions adapter for the Drizzle backend.
 *
 * Actions have not yet been implemented for the Drizzle adapter. Any attempt
 * to read or write actions on this backend throws at runtime so the gap is
 * obvious rather than silently returning empty results.
 */
export function createActionsAdapter(): ActionsAdapter {
  const notImplemented = (method: string): never => {
    throw new Error(
      `Actions are not implemented in the Drizzle adapter (called ${method}). ` +
        "Use the Kysely adapter for tenants that require actions.",
    );
  };

  return {
    create: () => notImplemented("create"),
    get: () => notImplemented("get"),
    list: () => notImplemented("list"),
    update: () => notImplemented("update"),
    remove: () => notImplemented("remove"),
  };
}
