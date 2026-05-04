import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { env } from "./lib/env";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const AUTHHERO_CERT_PATH = path.join(
  REPO_ROOT,
  "packages/create-authhero/auth-server/.certs/localhost.pem",
);
const SUITE_SERVER_CONTAINER = "conformance-suite-server-1";
const SUITE_TRUSTSTORE = "/opt/java/openjdk/lib/security/cacerts";
const SUITE_TRUSTSTORE_PASSWORD = "changeit";
const SUITE_TRUST_ALIAS = "authhero-local";

async function ping(url: string): Promise<boolean> {
  try {
    // Per-request timeout so a TCP-accepting-but-non-responding suite (e.g.
    // mid-startup) doesn't stall waitFor's poll loop past its outer deadline.
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(
  url: string,
  label: string,
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping(url)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label} at ${url}. Is the conformance suite running and is /etc/hosts mapping localhost.emobix.co.uk to 127.0.0.1?`,
  );
}

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(
      `Command killed by signal ${result.signal}: ${cmd} ${args.join(" ")}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed (exit ${result.status}): ${cmd} ${args.join(" ")}`,
    );
  }
}

// Ensure the suite's JRE truststore trusts the auth-server's self-signed
// cert. Idempotent: skips when the alias already exists. The suite is
// restarted afterwards so the running JVM picks up the new entry.
function trustAuthHeroCertInSuite(): void {
  if (!fs.existsSync(AUTHHERO_CERT_PATH)) {
    throw new Error(
      `HTTPS_ENABLED=true but cert not found at ${AUTHHERO_CERT_PATH}. ` +
        `Start the auth-server once with HTTPS_ENABLED=true to generate it.`,
    );
  }

  const ps = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      `name=^${SUITE_SERVER_CONTAINER}$`,
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf-8" },
  );
  if (ps.status !== 0 || !ps.stdout.trim()) {
    throw new Error(
      `Suite '${SUITE_SERVER_CONTAINER}' container not running; cannot import cert.`,
    );
  }

  const list = spawnSync(
    "docker",
    [
      "exec",
      SUITE_SERVER_CONTAINER,
      "keytool",
      "-list",
      "-alias",
      SUITE_TRUST_ALIAS,
      "-keystore",
      SUITE_TRUSTSTORE,
      "-storepass",
      SUITE_TRUSTSTORE_PASSWORD,
    ],
    { encoding: "utf-8" },
  );
  if (list.status === 0) {
    console.log(
      `[conformance-runner] Suite already trusts authhero-local cert — skipping import.`,
    );
    return;
  }

  console.log(
    `[conformance-runner] Importing authhero-local cert into suite truststore...`,
  );
  run("docker", [
    "cp",
    AUTHHERO_CERT_PATH,
    `${SUITE_SERVER_CONTAINER}:/tmp/authhero-local.pem`,
  ]);
  run("docker", [
    "exec",
    SUITE_SERVER_CONTAINER,
    "keytool",
    "-importcert",
    "-noprompt",
    "-alias",
    SUITE_TRUST_ALIAS,
    "-file",
    "/tmp/authhero-local.pem",
    "-keystore",
    SUITE_TRUSTSTORE,
    "-storepass",
    SUITE_TRUSTSTORE_PASSWORD,
  ]);
  // Truststore entries are loaded at JVM start, so the running suite must
  // restart before the new alias takes effect.
  run("docker", ["restart", SUITE_SERVER_CONTAINER]);
}

export default async function globalSetup(): Promise<void> {
  // Allow Node fetch to talk to the suite's self-signed cert.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  if (env.skipSetup) {
    console.log("[conformance-runner] SKIP_SETUP=1 — skipping docker + seed");
  } else {
    console.log("[conformance-runner] Starting conformance suite...");
    run("pnpm", ["conformance:start"]);

    console.log("[conformance-runner] Reseeding auth-server database...");
    run("pnpm", ["conformance:seed"]);
  }

  if (env.httpsEnabled) {
    trustAuthHeroCertInSuite();
  }

  console.log("[conformance-runner] Waiting for conformance suite API...");
  await waitFor(
    `${env.conformanceBaseUrl}/api/runner/available`,
    "conformance suite",
  );
  console.log("[conformance-runner] Conformance suite is ready.");
}
