import {
  ActionsAdapter,
  FeatureNotSupportedError,
} from "@authhero/adapter-interfaces";

/**
 * Stub actions adapter for the DynamoDB backend.
 *
 * The Actions feature has not yet been implemented for DynamoDB. Any attempt
 * to read or write actions on this backend throws at runtime so the gap is
 * obvious rather than silently returning empty results.
 */
export function createActionsAdapter(): ActionsAdapter {
  const notImplemented = (method: string): never => {
    throw new FeatureNotSupportedError(
      "actions",
      "AWS DynamoDB",
      `Called ${method}. Use a SQL-backed adapter (kysely or drizzle) for tenants that require actions.`,
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
