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
      const initial = await client.waitForState(testId, [
        "CONFIGURED",
        "WAITING",
        "FINISHED",
      ]);
      if (initial === "CONFIGURED") {
        await client.startTest(testId);
        await client.waitForState(testId, ["WAITING", "FINISHED"]);
      }

      await runBrowserFlow({ testId, page, client });
      await client.waitForState(testId, ["FINISHED", "INTERRUPTED"]);

      const info = await client.getInfo(testId);
      const result = info.result;
      console.log(
        `[conformance-runner] ${moduleName} status=${info.status} result=${result ?? "(none)"}`,
      );

      const acceptable: string[] = ["PASSED"];
      if (env.allowWarning) acceptable.push("WARNING");

      let failureDetail = "";
      if (!acceptable.includes(result ?? "")) {
        const log = await client.getTestLog(testId).catch(() => []);
        const firstFail = log.find((l) => l.result === "FAILURE");
        if (firstFail) {
          failureDetail = ` | first FAILURE: [${firstFail.src ?? "?"}] ${firstFail.msg ?? ""}`;
        }
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
