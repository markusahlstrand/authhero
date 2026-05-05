import { test, expect } from "@playwright/test";
import { ConformanceClient } from "../lib/conformance-api";
import { runBrowserFlow } from "../lib/run-browser-flow";
import { env } from "../lib/env";
import {
  PLAN_NAME,
  PLAN_VARIANT,
  buildPlanConfig,
} from "../lib/test-plan-config";

const client = new ConformanceClient();

let planId: string;
let modules: { testModule: string; variant?: Record<string, string> }[];

test.beforeAll(async () => {
  const config = buildPlanConfig();
  console.log(
    `[conformance-runner] Creating plan ${PLAN_NAME} with alias ${config.alias}`,
  );
  const plan = await client.createPlan(PLAN_NAME, config, PLAN_VARIANT);
  planId = plan.id;
  modules = plan.modules;
  console.log(
    `[conformance-runner] Plan ${planId} created — ${modules.length} module(s)`,
  );
  console.log(
    `[conformance-runner] Plan detail: ${client.baseUrl}/plan-detail.html?plan=${planId}`,
  );
});

// Modules whose WARNING outcome reflects a known unimplemented feature
// rather than a regression. Each entry should reference the issue tracking
// the work to make it PASS.
const MODULES_ALLOWED_TO_WARN = new Set<string>([
  // OIDC `claims` request parameter (essential claims) — issue #781
  "oidcc-claims-essential",
]);

test.describe.configure({ mode: "serial" });

test.describe("OIDCC Basic Certification", () => {
  // The plan is created lazily in beforeAll, so we register one Playwright test
  // per available module. Module names come from the suite's plan response.
  for (const moduleName of getStaticModulesForPlan()) {
    test(moduleName, async ({ page }) => {
      const moduleEntry = modules.find((m) => m.testModule === moduleName);
      test.skip(
        !moduleEntry,
        `module ${moduleName} not present in created plan`,
      );

      const created = await client.createTestFromPlan(
        planId,
        moduleName,
        moduleEntry?.variant,
      );
      const testId = created.id;
      console.log(
        `[conformance-runner] ${moduleName} -> ${client.baseUrl}/log-detail.html?log=${testId}`,
      );

      // Most OP tests auto-start; some need an explicit start when CONFIGURED.
      // INTERRUPTED is allowed at every stage so negative modules that move
      // straight to a terminal state don't crash the runner with a generic
      // "moved to INTERRUPTED: no detail" — let the result assertion below
      // surface the actual outcome instead.
      const initial = await client.waitForState(testId, [
        "CONFIGURED",
        "WAITING",
        "FINISHED",
        "INTERRUPTED",
      ]);
      if (initial === "CONFIGURED") {
        await client.startTest(testId);
        await client.waitForState(testId, [
          "WAITING",
          "FINISHED",
          "INTERRUPTED",
        ]);
      }

      const preBrowserInfo = await client.getInfo(testId);
      if (
        preBrowserInfo.status !== "FINISHED" &&
        preBrowserInfo.status !== "INTERRUPTED"
      ) {
        await runBrowserFlow({ testId, page, client });
        await client.waitForState(testId, ["FINISHED", "INTERRUPTED"]);
      }

      const info = await client.getInfo(testId);
      const result = info.result;
      console.log(
        `[conformance-runner] ${moduleName} status=${info.status} result=${result ?? "(none)"}`,
      );

      // REVIEW is the suite's outcome when a screenshot placeholder was
      // uploaded — for unattended runs we auto-fill those, so REVIEW means
      // "the suite finished and would normally need a human to verify the
      // screenshot." We treat it as PASSED.
      // Per-module WARNING allowlist tracks known-missing features by their
      // own issues. Drop entries from the set when the underlying feature
      // lands. env.allowWarning is the global escape hatch for CI debugging.
      const acceptable: string[] = ["PASSED", "REVIEW"];
      if (env.allowWarning || MODULES_ALLOWED_TO_WARN.has(moduleName)) {
        acceptable.push("WARNING");
      }

      let failureDetail = "";
      if (!acceptable.includes(result ?? "")) {
        const log = await client.getTestLog(testId).catch(() => []);
        // Surface the first FAILURE *and* WARNING from the suite's log so the
        // assertion message is self-contained — no need to open the web UI.
        const firstFail = log.find((l) => l.result === "FAILURE");
        const firstWarn = log.find((l) => l.result === "WARNING");
        const parts: string[] = [];
        if (firstFail) {
          parts.push(
            `first FAILURE: [${firstFail.src ?? "?"}] ${firstFail.msg ?? ""}`,
          );
        }
        if (firstWarn) {
          parts.push(
            `first WARNING: [${firstWarn.src ?? "?"}] ${firstWarn.msg ?? ""}`,
          );
        }
        if (parts.length > 0) failureDetail = ` | ${parts.join(" | ")}`;
      }

      expect(
        acceptable,
        `expected ${moduleName} result to be ${acceptable.join("/")}; got ${result ?? "(none)"} (status=${info.status}). Log: ${client.baseUrl}/log-detail.html?log=${testId}${failureDetail}`,
      ).toContain(result ?? "");
    });
  }
});

// The basic plan's module list (kept in source to allow `--grep`-style filtering
// before the suite is contacted). At runtime, modules absent from the live plan
// are skipped via test.skip above.
function getStaticModulesForPlan(): string[] {
  return [
    "oidcc-server",
    "oidcc-response-type-missing",
    "oidcc-idtoken-signature",
    "oidcc-idtoken-unsigned",
    "oidcc-userinfo-get",
    "oidcc-userinfo-post-header",
    "oidcc-userinfo-post-body",
    "oidcc-ensure-request-without-nonce-succeeds-for-code-flow",
    "oidcc-scope-profile",
    "oidcc-scope-email",
    "oidcc-scope-address",
    "oidcc-scope-phone",
    "oidcc-scope-all",
    "oidcc-ensure-other-scope-order-succeeds",
    "oidcc-display-page",
    "oidcc-display-popup",
    "oidcc-prompt-login",
    "oidcc-prompt-none-not-logged-in",
    "oidcc-prompt-none-logged-in",
    "oidcc-max-age-1",
    "oidcc-max-age-10000",
    "oidcc-ensure-request-with-unknown-parameter-succeeds",
    "oidcc-id-token-hint",
    "oidcc-login-hint",
    "oidcc-ui-locales",
    "oidcc-claims-locales",
    "oidcc-ensure-request-with-acr-values-succeeds",
    "oidcc-codereuse",
    "oidcc-codereuse-30seconds",
    "oidcc-ensure-registered-redirect-uri",
    "oidcc-ensure-post-request-succeeds",
    "oidcc-server-client-secret-post",
    "oidcc-request-uri-unsigned",
    "oidcc-unsigned-request-object-supported-correctly-or-rejected-as-unsupported",
    "oidcc-claims-essential",
    "oidcc-ensure-request-object-with-redirect-uri",
    "oidcc-refresh-token",
    "oidcc-ensure-request-with-valid-pkce-succeeds",
  ];
}
