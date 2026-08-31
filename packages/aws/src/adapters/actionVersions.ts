import {
  ActionVersionsAdapter,
  FeatureNotSupportedError,
} from "@authhero/adapter-interfaces";

/**
 * Stub action-versions adapter for the DynamoDB backend.
 *
 * Mirrors the actions adapter — both are unimplemented in AWS. Any call
 * throws so the gap is obvious rather than silently returning empty results.
 */
export function createActionVersionsAdapter(): ActionVersionsAdapter {
  const notImplemented = (method: string): never => {
    throw new FeatureNotSupportedError(
      "action versions",
      "AWS DynamoDB",
      `Called ${method}. Use a SQL-backed adapter (kysely or drizzle) for tenants that require actions.`,
    );
  };

  return {
    create: () => notImplemented("create"),
    get: () => notImplemented("get"),
    list: () => notImplemented("list"),
    removeForAction: () => notImplemented("removeForAction"),
  };
}
