import { test, expect } from "@playwright/test";
import { ConformanceClient } from "../lib/conformance-api";
import { runBrowserFlow } from "../lib/run-browser-flow";
import { env } from "../lib/env";
import {
  LOGOUT_PLAN_NAME,
  LOGOUT_PLAN_VARIANT,
  buildLogoutPlanConfig,
} from "../lib/test-plan-config";

const client = new ConformanceClient();

let planId: string;
let modules: { testModule: string; variant?: Record<string, string> }[];

test.beforeAll(async () => {
  const config = buildLogoutPlanConfig();
  console.log(
    `[conformance-runner] Creating plan ${LOGOUT_PLAN_NAME} with alias ${config.alias}`,
  );
  const plan = await client.createPlan(
    LOGOUT_PLAN_NAME,
    config,
    LOGOUT_PLAN_VARIANT,
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

// RP-initiated logout depends on `end_session_endpoint` being advertised in
// the discovery document. Until we wire that up + implement the OIDC logout
// endpoint, every module is expected to fail. Listed here so they show up as
// pending work rather than silent skips. Drop entries when each module starts
// passing.
const MODULES_ALLOWED_TO_WARN = new Set<string>([]);

test.describe.configure({ mode: "serial" });

test.describe("OIDCC RP-Initiated Logout Certification", () => {
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

      // Accept INTERRUPTED here too — some negative modules (e.g.
      // bad-id-token-hint) drive the failure path entirely from the suite's
      // configuration phase and never enter WAITING. Letting the result
      // assertion below decide instead of throwing gives a much cleaner
      // signal than "moved to INTERRUPTED: no detail".
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

      const acceptable: string[] = ["PASSED", "REVIEW"];
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
    "oidcc-rp-initiated-logout-discovery-endpoint-verification",
    "oidcc-rp-initiated-logout",
    "oidcc-rp-initiated-logout-bad-post-logout-redirect-uri",
    "oidcc-rp-initiated-logout-modified-id-token-hint",
    "oidcc-rp-initiated-logout-no-id-token-hint",
    "oidcc-rp-initiated-logout-no-params",
    "oidcc-rp-initiated-logout-no-post-logout-redirect-uri",
    "oidcc-rp-initiated-logout-no-state",
    "oidcc-rp-initiated-logout-only-state",
    "oidcc-rp-initiated-logout-query-added-to-post-logout-redirect-uri",
    "oidcc-rp-initiated-logout-bad-id-token-hint",
  ];
}
