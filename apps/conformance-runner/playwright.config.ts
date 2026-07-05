import { defineConfig, devices } from "@playwright/test";
import { env } from "./lib/env";
import { prepareAuthServer } from "./lib/prepare-auth-server";

// Playwright runs plugin setup (which spawns webServer) BEFORE globalSetup,
// so anything the auth-server's `npm run dev` needs to exist — the directory
// itself, node_modules, a seeded DB, the HTTPS cert, plus the conformance
// suite the discovery health check ultimately depends on — has to be in
// place by the time defineConfig returns. Hence this synchronous prep step
// at module-load time. globalSetup handles only the post-server work
// (importing the auth-server cert into the suite's truststore + waiting for
// the suite API).
prepareAuthServer();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  // Each spec file drives its own OIDF test plan, and the suite serializes
  // per alias — workers each claim a distinct alias (env.workerAlias), so
  // plans run concurrently and wall time ≈ the longest single plan. Capped
  // at 4 because the seeded clients only register callbacks for the base
  // alias plus -w1..-w3. Override with PW_WORKERS (e.g. PW_WORKERS=1 to
  // debug serially).
  // `||` not `??`: CI passes PW_WORKERS as an empty string when the dispatch
  // input is unset, and Number("") is 0.
  workers: Math.min(
    4,
    Number(process.env.PW_WORKERS || (process.env.CI ? 2 : 1)),
  ),
  // Without serial mode a systemic outage (auth-server down) would otherwise
  // burn a worker restart per module for all ~260 modules — bail out early.
  maxFailures: process.env.CI ? 15 : 0,
  // One retry in CI: the OIDF suite occasionally stalls module-side (e.g.
  // stuck in RUNNING after "Redirecting to authorization endpoint" without
  // ever exposing the next browser URL). Genuine regressions fail both
  // attempts; a retry gets a fresh plan and rescues suite hiccups.
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: env.conformanceBaseUrl,
    // Playwright's default actionTimeout is 0 (unlimited) — a single fill()
    // waiting for an element that never appears would otherwise consume the
    // whole 180s test budget before failing.
    actionTimeout: 10_000,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Bypass `npm run dev` (which uses `tsx watch`) — the watcher restarts
    // the auth-server when it detects file activity (db.sqlite writes,
    // .certs/ touches), and a mid-test restart causes the suite to see
    // "Connection refused" against the host gateway. Plain tsx is enough
    // for a one-shot conformance run.
    command: "npx tsx --env-file=.env src/index.ts",
    cwd: "../conformance-auth-server",
    url: `${env.authheroBaseUrl}/.well-known/openid-configuration`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PORT: "3000",
      ISSUER: env.authheroIssuer,
      HTTPS_ENABLED: env.httpsEnabled ? "true" : "false",
      // The auth-server fetches client-published jwks_uri values during
      // private_key_jwt verification. The OIDF suite hosts those at
      // https://localhost.emobix.co.uk:8443/... behind a self-signed cert
      // that isn't in Node's trust store — disable TLS verification for
      // the conformance auth-server only.
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
    },
  },
});
