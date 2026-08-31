import {
  ActionExecutionsAdapter,
  FeatureNotSupportedError,
} from "@authhero/adapter-interfaces";

/**
 * Stub action-executions adapter for the DynamoDB backend.
 *
 * Mirrors the actions/actionVersions adapters — the Actions feature is not
 * implemented in AWS. Any call throws so the gap is obvious rather than
 * silently returning empty results.
 */
export function createActionExecutionsAdapter(): ActionExecutionsAdapter {
  const notImplemented = (method: string): never => {
    throw new FeatureNotSupportedError(
      "action executions",
      "AWS DynamoDB",
      `Called ${method}. Use a SQL-backed adapter (kysely or drizzle) for tenants that require actions.`,
    );
  };

  return {
    create: () => notImplemented("create"),
    get: () => notImplemented("get"),
  };
}
