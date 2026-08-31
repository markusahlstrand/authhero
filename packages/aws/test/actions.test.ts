import { describe, expect, it } from "vitest";
import {
  FeatureNotSupportedError,
  isFeatureNotSupportedError,
} from "@authhero/adapter-interfaces";
import {
  createActionsAdapter,
  createActionExecutionsAdapter,
  createActionVersionsAdapter,
} from "../src";

/**
 * The Actions feature has no DynamoDB implementation. The three stub adapters
 * throw a typed `FeatureNotSupportedError` so HTTP callers can map the gap to
 * 501 instead of a generic 500 — these tests pin that contract (and the fact
 * that the factories are re-exported from the package root at all).
 */
describe("aws actions stubs", () => {
  const cases = [
    ["actions", createActionsAdapter()],
    ["action executions", createActionExecutionsAdapter()],
    ["action versions", createActionVersionsAdapter()],
  ] as const;

  for (const [feature, adapter] of cases) {
    it(`throws FeatureNotSupportedError from every ${feature} method`, () => {
      const methods = Object.keys(adapter) as Array<keyof typeof adapter>;
      expect(methods.length).toBeGreaterThan(0);

      for (const method of methods) {
        let thrown: unknown;
        try {
          // The stubs throw before touching their arguments.
          (adapter[method] as () => unknown)();
        } catch (error) {
          thrown = error;
        }

        expect(isFeatureNotSupportedError(thrown)).toBe(true);
        const err = thrown as FeatureNotSupportedError;
        expect(err.feature).toBe(feature);
        expect(err.adapter).toBe("AWS DynamoDB");
        // The failing method is named so the log points at the call site.
        expect(err.message).toContain(String(method));
      }
    });
  }
});
