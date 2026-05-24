import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:https";
import { serve, type ServerType } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { getTestServer } from "../helpers/test-server";
import { MANAGEMENT_API_SCOPES } from "../../src/seed";
import { MANAGEMENT_API_AUDIENCE } from "../../src/middlewares/authentication";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixture",
);

function hasBin(name: string): boolean {
  const result = spawnSync(name, ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

async function runTerraform(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("terraform", args, { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", reject);
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

const terraformAvailable = hasBin("terraform");
const mkcertAvailable = hasBin("mkcert");
const skipReason = !terraformAvailable
  ? "terraform CLI not on PATH"
  : !mkcertAvailable
    ? "mkcert CLI not on PATH (brew install mkcert && mkcert -install)"
    : null;
const describeIfReady = skipReason ? describe.skip : describe;

if (skipReason) {
  // Surface why the suite is skipped so it's not silent.
  describe.skip(`terraform-provider-auth0 smoke test [${skipReason}]`, () => {
    it("skipped", () => {});
  });
}

describeIfReady("terraform-provider-auth0 smoke test", () => {
  let server: ServerType;
  let workdir: string;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    const ts = await getTestServer();

    workdir = mkdtempSync(path.join(tmpdir(), "authhero-tf-"));
    const certPath = path.join(workdir, "cert.pem");
    const keyPath = path.join(workdir, "key.pem");

    // mkcert signs with a CA installed in the system trust store, so Go's
    // crypto/x509 (which on macOS reads only the keychain, not SSL_CERT_FILE)
    // accepts the cert without further configuration. The user is expected
    // to have run `mkcert -install` once on this machine.
    const mkcert = spawnSync(
      "mkcert",
      ["-cert-file", certPath, "-key-file", keyPath, "127.0.0.1", "localhost"],
      { encoding: "utf8" },
    );
    if (mkcert.status !== 0) {
      throw new Error(
        `mkcert failed (exit ${mkcert.status})\nstdout:\n${mkcert.stdout}\nstderr:\n${mkcert.stderr}`,
      );
    }
    const certPem = readFileSync(certPath, "utf8");
    const keyPem = readFileSync(keyPath, "utf8");

    const addr = await new Promise<AddressInfo>((resolve) => {
      server = serve(
        {
          fetch: async (req) => {
            const url = new URL(req.url);
            const isApi = url.pathname.startsWith("/api/v2/");
            let body: string | undefined;
            if (isApi && req.method !== "GET") {
              body = await req.clone().text();
            }
            const res = await ts.app.fetch(req, ts.env);
            if (isApi) {
              const resBody = await res.clone().text();
              process.stderr.write(
                `[authhero] ${req.method} ${url.pathname} -> ${res.status}\n` +
                  (body ? `  req: ${body}\n` : "") +
                  `  res: ${resBody.slice(0, 500)}\n`,
              );
            }
            return res;
          },
          port: 0,
          hostname: "127.0.0.1",
          createServer,
          serverOptions: {
            key: keyPem,
            cert: certPem,
            ALPNProtocols: ["http/1.1"],
          },
        },
        (info) => resolve(info as AddressInfo),
      );
      (server as unknown as NodeJS.EventEmitter).on(
        "tlsClientError",
        (err: Error) => {
          process.stderr.write(`[tlsClientError] ${err.message}\n`);
        },
      );
    });
    const baseUrl = `https://127.0.0.1:${addr.port}`;
    ts.env.ISSUER = `${baseUrl}/`;

    const audience = MANAGEMENT_API_AUDIENCE;

    await ts.env.data.resourceServers.create("tenantId", {
      name: "Authhero Management API (test)",
      identifier: audience,
      scopes: MANAGEMENT_API_SCOPES,
      signing_alg: "RS256",
      token_lifetime: 86400,
      token_lifetime_for_web: 7200,
      options: {
        enforce_policies: true,
        token_dialect: "access_token_authz",
      },
    });

    await ts.env.data.clients.create("tenantId", {
      client_id: "tf-provider",
      client_secret: "tf-provider-secret",
      name: "Terraform Provider",
      grant_types: ["client_credentials"],
    });

    await ts.env.data.clientGrants.create("tenantId", {
      client_id: "tf-provider",
      audience,
      scope: MANAGEMENT_API_SCOPES.map((s) => s.value),
    });

    copyFileSync(
      path.join(FIXTURE_DIR, "main.tf"),
      path.join(workdir, "main.tf"),
    );
    writeFileSync(
      path.join(workdir, "terraform.tfvars"),
      [
        `domain        = "127.0.0.1:${addr.port}"`,
        `client_id     = "tf-provider"`,
        `client_secret = "tf-provider-secret"`,
        `audience      = "${audience}"`,
      ].join("\n"),
    );

    env = {
      ...process.env,
      TF_IN_AUTOMATION: "1",
      TF_INPUT: "0",
    };

    const init = await runTerraform(
      ["init", "-input=false", "-no-color"],
      workdir,
      env,
      120_000,
    );
    if (init.status !== 0) {
      throw new Error(
        `terraform init failed (exit ${init.status})\nstdout:\n${init.stdout}\nstderr:\n${init.stderr}`,
      );
    }
  }, 180_000);

  afterAll(async () => {
    if (workdir) rmSync(workdir, { recursive: true, force: true });
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it("applies the full fixture", async () => {
    const apply = await runTerraform(
      ["apply", "-auto-approve", "-input=false", "-no-color"],
      workdir,
      env,
      180_000,
    );
    const logPath = path.join(workdir, "apply.log");
    writeFileSync(
      logPath,
      `exit=${apply.status} signal=${apply.signal ?? ""}\n` +
        `--- stdout ---\n${apply.stdout}\n` +
        `--- stderr ---\n${apply.stderr}\n`,
    );
    process.stderr.write(`\n[apply log: ${logPath}]\n`);
    if (apply.stdout) process.stderr.write(apply.stdout);
    if (apply.stderr) process.stderr.write(apply.stderr);
    expect(apply.signal).toBeNull();
    expect(apply.status).toBe(0);
  }, 240_000);
});
