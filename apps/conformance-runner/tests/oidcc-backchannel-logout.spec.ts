import { test, expect } from "@playwright/test";
import { ConformanceClient, downloadPlanReport } from "../lib/conformance-api";
import { runBrowserFlow } from "../lib/run-browser-flow";
import { env } from "../lib/env";
import {
  BACKCHANNEL_LOGOUT_PLAN_NAME,
  BACKCHANNEL_LOGOUT_PLAN_VARIANT,
  buildBackchannelLogoutPlanConfig,
} from "../lib/test-plan-config";

const client = new ConformanceClient();

let planId: string;
let modules: { testModule: string; variant?: Record<string, string> }[];

test.beforeAll(async () => {
  const config = buildBackchannelLogoutPlanConfig();
  console.log(
    `[conformance-runner] Creating plan ${BACKCHANNEL_LOGOUT_PLAN_NAME} with alias ${config.alias}`,
  );
  const plan = await client.createPlan(
    BACKCHANNEL_LOGOUT_PLAN_NAME,
    config,
    BACKCHANNEL_LOGOUT_PLAN_VARIANT,
  );
  planId = plan.id;
  modules = plan.modules;
  console.log(
    `[conformance-runner] Plan ${planId} created — ${modules.length} module(s)`,
  );
  console.log(
    `[conformance-runner] Plan detail: ${client.baseUrl}/plan-detail.html?plan=${planId}`,
  );
});

test.afterAll(async () => {
  await downloadPlanReport(client, BACKCHANNEL_LOGOUT_PLAN_NAME, planId);
});

// Modules whose WARNING result we accept as a pass (matches the pattern used
// by the other plans).
const MODULES_ALLOWED_TO_WARN = new Set<string>([]);

// Modules we still expect to fail. Entries land here as we discover real
// gaps — drop them once the underlying behaviour is fixed.
const MODULES_EXPECTED_TO_FAIL = new Set<string>([]);

test.describe.configure({ mode: "default" });

test.describe("OIDCC Backchannel RP-Initiated Logout Certification", () => {
  for (const moduleName of getStaticModulesForPlan()) {
    test(moduleName, async ({ page }) => {
      test.fail(
        MODULES_EXPECTED_TO_FAIL.has(moduleName),
        "Known gap in backchannel logout implementation",
      );
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

      const acceptable: string[] = ["PASSED", "REVIEW", "SKIPPED"];
      if (env.allowWarning) acceptable.push("WARNING");
      if (MODULES_ALLOWED_TO_WARN.has(moduleName)) acceptable.push("WARNING");

      let failureDetail = "";
      if (!acceptable.includes(result ?? "")) {
        const log = await client.getTestLog(testId).catch(() => []);
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

function getStaticModulesForPlan(): string[] {
  return [
    "oidcc-backchannel-logout-discovery-endpoint-verification",
    "oidcc-backchannel-rp-initiated-logout",
  ];
}
