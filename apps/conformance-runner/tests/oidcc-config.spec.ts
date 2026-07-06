import { test, expect } from "@playwright/test";
import { ConformanceClient, downloadPlanReport } from "../lib/conformance-api";
import { runBrowserFlow } from "../lib/run-browser-flow";
import { env } from "../lib/env";
import {
  CONFIG_PLAN_NAME,
  buildConfigPlanConfig,
} from "../lib/test-plan-config";

const client = new ConformanceClient();

let planId: string;
let modules: { testModule: string; variant?: Record<string, string> }[];

test.beforeAll(async () => {
  const config = buildConfigPlanConfig();
  console.log(
    `[conformance-runner] Creating plan ${CONFIG_PLAN_NAME} with alias ${config.alias}`,
  );
  // No plan-level variant — see CONFIG_PLAN_NAME comment in test-plan-config.
  const plan = await client.createPlan(CONFIG_PLAN_NAME, config);
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
  await downloadPlanReport(client, CONFIG_PLAN_NAME, planId);
});

const MODULES_ALLOWED_TO_WARN = new Set<string>([]);

// No serial mode: with per-test isolation a failure tears down only its own
// worker (the next test gets a fresh worker + plan), so one flaky module
// doesn't skip the rest of the file, and a CI retry re-runs just the failed
// module instead of the whole plan.
test.describe.configure({ mode: "default" });

test.describe("OIDCC Config Certification", () => {
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
      if (env.allowWarning || MODULES_ALLOWED_TO_WARN.has(moduleName)) {
        acceptable.push("WARNING");
      }

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
  return ["oidcc-discovery-endpoint-verification"];
}
