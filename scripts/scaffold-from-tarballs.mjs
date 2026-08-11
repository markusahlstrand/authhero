#!/usr/bin/env node
// Scaffold each create-authhero template against the *packed tarballs* rather
// than the workspace, then type-check the result.
//
// The existing smoke test in unit-tests.yml scaffolds with `--workspace` and
// finishes with `wrangler deploy --dry-run`. That combination cannot see three
// classes of bug, all of which have shipped to users:
//
//   * a peer range no published version satisfies — `workspace:*` links satisfy
//     it locally, so only a registry-shaped install surfaces the ETARGET
//   * a package whose tarball is missing its build output — CI built it from
//     source a step earlier, so the empty tarball never gets exercised
//   * a package shipping no .d.ts — esbuild strips types without checking them,
//     so bundling passes regardless
//
// Installing from tarballs into a project outside the workspace reproduces what
// `npm create authhero` actually does on a user's machine.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Everything the templates can depend on. Packed as tarballs and substituted
// into the scaffolded manifest, so the scaffold resolves them the way a user
// would rather than through the workspace.
const PUBLISHABLE = [
  "packages/adapter-interfaces",
  "packages/proxy",
  "packages/saml",
  "packages/authhero",
  "packages/drizzle",
  "packages/kysely",
  "packages/multi-tenancy",
  "packages/cloudflare",
  "packages/aws",
  "packages/ui-widget",
  "apps/admin",
];

// `postAssets` templates generate src/admin-index-html.ts from the installed
// @authhero/admin tarball, so the type-check depends on that step running.
const TEMPLATES = [
  { name: "local-smoke", template: "local", postAssets: false },
  { name: "cloudflare-smoke", template: "cloudflare", postAssets: true },
];

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf-8",
    stdio: opts.capture ? "pipe" : "inherit",
    ...opts,
  });
}

function packAll(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const tarballs = new Map();

  for (const pkgDir of PUBLISHABLE) {
    const abs = path.join(repoRoot, pkgDir);
    const { name } = JSON.parse(
      fs.readFileSync(path.join(abs, "package.json"), "utf-8"),
    );
    const before = new Set(fs.readdirSync(destination));
    run("pnpm", ["pack", "--pack-destination", destination], { cwd: abs });
    const created = fs
      .readdirSync(destination)
      .filter((f) => f.endsWith(".tgz") && !before.has(f));

    if (created.length !== 1) {
      throw new Error(
        `pnpm pack for ${name} produced ${created.length} tarballs, expected 1`,
      );
    }
    tarballs.set(name, path.join(destination, created[0]));
    console.log(`packed ${name} -> ${created[0]}`);
  }
  return tarballs;
}

// A package that builds to nothing still packs successfully — @authhero/admin
// shipped an empty tarball this way. Assert the artifact carries real files.
function assertTarballsNonEmpty(tarballs) {
  const failures = [];

  for (const [name, tgz] of tarballs) {
    const listing = run("tar", ["-tzf", tgz], { capture: true })
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.endsWith("/") && f !== "package/package.json");

    const meaningful = listing.filter(
      (f) => !/package\/(README|LICENSE|CHANGELOG)/i.test(f),
    );
    if (meaningful.length === 0) {
      failures.push(`${name}: tarball contains no build output`);
    }
  }

  if (failures.length) {
    throw new Error(`Empty package tarballs:\n  ${failures.join("\n  ")}`);
  }
}

// Point every workspace-authored dependency at its tarball. Anything else keeps
// the range the template declares, so the registry still gets exercised.
function rewriteDeps(projectDir, tarballs) {
  const manifestPath = path.join(projectDir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const substituted = [];

  for (const field of ["dependencies", "devDependencies"]) {
    for (const dep of Object.keys(manifest[field] ?? {})) {
      if (tarballs.has(dep)) {
        manifest[field][dep] = `file:${tarballs.get(dep)}`;
        substituted.push(dep);
      }
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return substituted;
}

function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "authhero-scaffold-"));
  console.log(`scaffolding into ${workDir} (outside the pnpm workspace)`);

  const tarballs = packAll(path.join(workDir, "tarballs"));
  assertTarballsNonEmpty(tarballs);

  for (const { name, template, postAssets } of TEMPLATES) {
    console.log(`\n=== ${template} ===`);
    const projectDir = path.join(workDir, name);

    run(
      "node",
      [
        path.join(repoRoot, "packages/create-authhero/index.js"),
        name,
        `--template=${template}`,
        "--admin-ui",
        "--skip-install",
        "--skip-migrate",
        "--skip-start",
        "--yes",
      ],
      { cwd: workDir },
    );

    const substituted = rewriteDeps(projectDir, tarballs);
    console.log(`installing from tarballs: ${substituted.join(", ")}`);

    // npm rather than pnpm: the scaffold is a standalone project and npm
    // resolves peer ranges strictly, which is what surfaces an unsatisfiable
    // peer range instead of downgrading it to a warning.
    run("npm", ["install", "--no-audit", "--no-fund"], { cwd: projectDir });

    if (postAssets) {
      run("node", ["copy-assets.js"], { cwd: projectDir });
    }

    console.log("type-checking...");
    run("npx", ["tsc", "--noEmit"], { cwd: projectDir });
    console.log(`✅ ${template} installs from tarballs and type-checks`);
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  console.log("\nAll templates verified against packed tarballs.");
}

main();
