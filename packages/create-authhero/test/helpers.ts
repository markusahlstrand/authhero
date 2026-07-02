import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(__dirname, "..");
export const repoRoot = path.resolve(packageRoot, "..", "..");

// Run the CLI from source via tsx so tests exercise src/index.ts directly
// without requiring a build. Template resolution falls back to ../templates
// when running from src (see candidatePaths in src/index.ts).
const tsxCli = path.join(packageRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntry = path.join(packageRoot, "src", "index.ts");

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, cliEntry, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

export interface ScaffoldResult extends CliResult {
  projectPath: string;
}

export function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "create-authhero-test-"));
}

/**
 * Scaffold a project non-interactively into a fresh temp directory.
 * Install/migrate/start are always skipped — tests only inspect the
 * generated files.
 */
export async function scaffold(
  projectName: string,
  flags: string[],
  tempRoot: string,
): Promise<ScaffoldResult> {
  const result = await runCli(
    [
      projectName,
      ...flags,
      "--yes",
      "--skip-install",
      "--skip-migrate",
      "--skip-start",
    ],
    tempRoot,
  );
  return { ...result, projectPath: path.join(tempRoot, projectName) };
}

export function readJson(filePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function exists(projectPath: string, relative: string): boolean {
  return fs.existsSync(path.join(projectPath, relative));
}

export function readFile(projectPath: string, relative: string): string {
  return fs.readFileSync(path.join(projectPath, relative), "utf-8");
}

/** Recursively list every .ts file in a directory (relative paths). */
export function listTsFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...listTsFiles(full, base));
    } else if (entry.name.endsWith(".ts")) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}
