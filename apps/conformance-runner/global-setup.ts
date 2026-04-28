import { spawnSync } from "node:child_process";
import { env } from "./lib/env";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

async function ping(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
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
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${cmd} ${args.join(" ")}`,
    );
  }
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

  console.log("[conformance-runner] Waiting for conformance suite API...");
  await waitFor(
    `${env.conformanceBaseUrl}/api/runner/available`,
    "conformance suite",
  );
  console.log("[conformance-runner] Conformance suite is ready.");
}
