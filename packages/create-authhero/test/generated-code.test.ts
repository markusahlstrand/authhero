import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listTsFiles,
  makeTempDir,
  readJson,
  repoRoot,
  scaffold,
  type ScaffoldResult,
} from "./helpers";

// These tests catch drift between the code create-authhero generates (or
// copies from templates/) and the actual authhero packages: renamed exports,
// removed functions, wrong package names, or template-string typos that
// produce invalid TypeScript. The sibling packages must be built first
// (`pnpm -r --filter './packages/**' build`).

const cases = {
  local: ["--template", "local"],
  "local-multi": ["--template", "local", "--multi-tenant"],
  "local-conformance": ["--template", "local", "--conformance"],
  cloudflare: ["--template", "cloudflare"],
  "cloudflare-multi": ["--template", "cloudflare", "--multi-tenant"],
  "wfp-dispatcher": ["--template", "cloudflare-wfp-dispatcher"],
  "wfp-tenant": ["--template", "cloudflare-wfp-tenant"],
  "control-plane": ["--template", "cloudflare-control-plane"],
  "aws-sst": ["--template", "aws-sst"],
  proxy: ["--template", "proxy"],
} as const;

type CaseName = keyof typeof cases;

// Relative imports that only exist after `npm install` (created by the
// template's copy-assets.js postinstall step).
const POSTINSTALL_MODULES = new Set(["./admin-index-html"]);

let tempRoot: string;
const projects = {} as Record<CaseName, ScaffoldResult>;

beforeAll(async () => {
  tempRoot = makeTempDir();
  await Promise.all(
    (Object.keys(cases) as CaseName[]).map(async (name) => {
      projects[name] = await scaffold(name, [...cases[name]], tempRoot);
      expect(projects[name].exitCode, projects[name].stderr).toBe(0);
    }),
  );
}, 120_000);

afterAll(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
});

interface ParsedImport {
  specifier: string;
  defaultImport?: string;
  namedImports: string[];
  namespaceImport?: string;
}

function parseImports(filePath: string): ParsedImport[] {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: ParsedImport[] = [];
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const parsed: ParsedImport = {
      specifier: statement.moduleSpecifier.text,
      namedImports: [],
    };
    const clause = statement.importClause;
    if (clause?.name) parsed.defaultImport = clause.name.text;
    if (clause?.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        parsed.namespaceImport = clause.namedBindings.name.text;
      } else {
        for (const element of clause.namedBindings.elements) {
          // For `import { a as b }`, the exported name is `a`.
          parsed.namedImports.push((element.propertyName ?? element.name).text);
        }
      }
    }
    imports.push(parsed);
  }
  return imports;
}

interface PackageExports {
  names: Set<string>;
  hasDefault: boolean;
  subpaths: Set<string>;
  loadErrors: string[];
}

// Map published package names to their workspace directories.
function workspaceDirFor(specifier: string): string | undefined {
  const dirs = [
    ...fs
      .readdirSync(path.join(repoRoot, "packages"))
      .map((d) => path.join(repoRoot, "packages", d)),
    path.join(repoRoot, "apps", "admin"),
  ];
  for (const dir of dirs) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    if (readJson(pkgJsonPath).name === specifier) return dir;
  }
  return undefined;
}

const exportsCache = new Map<string, Promise<PackageExports>>();

function getPackageExports(specifier: string): Promise<PackageExports> {
  let cached = exportsCache.get(specifier);
  if (!cached) {
    cached = loadPackageExports(specifier);
    exportsCache.set(specifier, cached);
  }
  return cached;
}

// Collect exported names from a .d.ts file, following `export * from` into
// relative files and workspace packages (e.g. authhero re-exports all of
// @authhero/adapter-interfaces).
async function scanDts(
  filePath: string,
  result: PackageExports,
  visited: Set<string>,
): Promise<void> {
  // A bare specifier like "./operations" may exist as a directory; only a
  // regular file can be read, so fall through to .d.ts / index.d.ts variants.
  const resolved = [
    filePath,
    `${filePath}.d.ts`,
    path.join(filePath, "index.d.ts"),
  ].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!resolved || visited.has(resolved)) return;
  visited.add(resolved);

  const dts = fs.readFileSync(resolved, "utf-8");
  for (const match of dts.matchAll(
    /export\s+(?:declare\s+)?(?:abstract\s+)?(?:function|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z0-9_$]+)/g,
  )) {
    result.names.add(match[1]!);
  }
  for (const list of dts.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const raw of list[1]!.split(",")) {
      const token = raw.trim().replace(/^type\s+/, "");
      if (!token) continue;
      // `X as Y` exports the name Y; `X as default` exports default.
      const parts = token.split(/\s+as\s+/);
      const exported = (parts[1] ?? parts[0])!.trim();
      if (exported === "default") result.hasDefault = true;
      else result.names.add(exported);
    }
  }
  if (/export\s+default\s/.test(dts)) result.hasDefault = true;

  for (const reexport of dts.matchAll(
    /export\s+(?:type\s+)?\*\s+from\s+["']([^"']+)["']/g,
  )) {
    const target = reexport[1]!;
    if (target.startsWith(".")) {
      await scanDts(
        path.resolve(path.dirname(resolved), target),
        result,
        visited,
      );
    } else if (workspaceDirFor(target)) {
      const nested = await getPackageExports(target);
      for (const name of nested.names) result.names.add(name);
    }
  }
}

async function loadPackageExports(specifier: string): Promise<PackageExports> {
  const dir = workspaceDirFor(specifier);
  if (!dir) {
    throw new Error(
      `"${specifier}" is not a package in this workspace — ` +
        `scaffolded code imports a package that does not exist`,
    );
  }
  const pkg = readJson(path.join(dir, "package.json"));
  const result: PackageExports = {
    names: new Set(),
    hasDefault: false,
    subpaths: new Set(Object.keys(pkg.exports ?? {})),
    loadErrors: [],
  };

  // Runtime exports from the built ESM bundle.
  const entry = pkg.exports?.["."]?.import ?? pkg.module ?? pkg.main;
  if (entry) {
    const entryPath = path.join(dir, entry);
    if (fs.existsSync(entryPath)) {
      try {
        const mod = await import(pathToFileURL(entryPath).href);
        for (const name of Object.keys(mod)) result.names.add(name);
        result.hasDefault = "default" in mod;
      } catch (e) {
        result.loadErrors.push(`import ${entry}: ${e}`);
      }
    } else {
      result.loadErrors.push(`missing ${entry} — run pnpm -r build first`);
    }
  }

  // Type exports from the bundled .d.ts (covers type-only names like
  // AuthHeroConfig that have no runtime value).
  const types = pkg.exports?.["."]?.types ?? pkg.types;
  if (types && fs.existsSync(path.join(dir, types))) {
    await scanDts(path.join(dir, types), result, new Set());
  }

  if (result.names.size === 0 && !result.hasDefault) {
    throw new Error(
      `Could not load any exports for "${specifier}" from ${dir}. ` +
        `Build the workspace first (pnpm -r --filter './packages/**' build). ` +
        `Errors: ${result.loadErrors.join("; ") || "none"}`,
    );
  }
  return result;
}

function tsFilesFor(name: CaseName): string[] {
  const { projectPath } = projects[name];
  return [
    ...listTsFiles(path.join(projectPath, "src")).map((f) =>
      path.join("src", f),
    ),
    ...["sst.config.ts", "drizzle.config.ts"].filter((f) =>
      fs.existsSync(path.join(projectPath, f)),
    ),
  ];
}

describe.each(Object.keys(cases) as CaseName[])("%s", (name) => {
  it("produces syntactically valid TypeScript", () => {
    const { projectPath } = projects[name];
    for (const file of tsFilesFor(name)) {
      const filePath = path.join(projectPath, file);
      const { diagnostics } = ts.transpileModule(
        fs.readFileSync(filePath, "utf-8"),
        {
          reportDiagnostics: true,
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
          },
        },
      );
      const errors = (diagnostics ?? []).map((d) =>
        ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      );
      expect(errors, `${file} should have no syntax errors`).toEqual([]);
    }
  });

  it("only depends on @authhero packages that actually exist", () => {
    const pkg = readJson(path.join(projects[name].projectPath, "package.json"));
    const deps = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }).filter((d) => d === "authhero" || d.startsWith("@authhero/"));
    for (const dep of deps) {
      expect(
        workspaceDirFor(dep),
        `dependency "${dep}" does not match any workspace package name`,
      ).toBeTruthy();
    }
  });

  it("relative imports resolve to files in the scaffold", () => {
    const { projectPath } = projects[name];
    for (const file of tsFilesFor(name)) {
      for (const imp of parseImports(path.join(projectPath, file))) {
        if (!imp.specifier.startsWith(".")) continue;
        if (POSTINSTALL_MODULES.has(imp.specifier)) continue;
        const base = path.resolve(
          path.dirname(path.join(projectPath, file)),
          imp.specifier,
        );
        const found = [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          path.join(base, "index.ts"),
        ].some((candidate) => fs.existsSync(candidate));
        expect(
          found,
          `${file} imports "${imp.specifier}" which does not exist`,
        ).toBe(true);
      }
    }
  });

  it("imports from authhero packages that the packages actually export", async () => {
    const { projectPath } = projects[name];
    for (const file of tsFilesFor(name)) {
      for (const imp of parseImports(path.join(projectPath, file))) {
        const { specifier } = imp;
        if (specifier !== "authhero" && !specifier.startsWith("@authhero/")) {
          continue;
        }

        // Subpath imports (e.g. @authhero/drizzle/schema/sqlite) — verify
        // the exports map exposes the subpath.
        const match = specifier.match(/^(@authhero\/[^/]+)\/(.+)$/);
        if (match) {
          const exports = await getPackageExports(match[1]!);
          expect(
            exports.subpaths.has(`./${match[2]}`),
            `${file}: "${match[1]}" does not export subpath "./${match[2]}"`,
          ).toBe(true);
          continue;
        }

        const exports = await getPackageExports(specifier);
        if (imp.defaultImport) {
          expect(
            exports.hasDefault,
            `${file}: "${specifier}" has no default export ` +
              `(imported as ${imp.defaultImport})`,
          ).toBe(true);
        }
        for (const namedImport of imp.namedImports) {
          expect(
            exports.names.has(namedImport),
            `${file}: "${specifier}" does not export "${namedImport}"`,
          ).toBe(true);
        }
      }
    }
  });
});
