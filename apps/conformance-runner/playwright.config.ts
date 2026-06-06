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
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: env.conformanceBaseUrl,
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
