import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  exists,
  makeTempDir,
  readFile,
  readJson,
  runCli,
  scaffold,
  type ScaffoldResult,
} from "./helpers";

// One scaffold per template / flag combination, created once and inspected by
// many tests below.
const cases = {
  local: ["--template", "local"],
  "local-workspace-multi": [
    "--template",
    "local",
    "--workspace",
    "--multi-tenant",
  ],
  "local-conformance": [
    "--template",
    "local",
    "--conformance",
    "--conformance-alias",
    "my-alias",
  ],
  cloudflare: ["--template", "cloudflare"],
  "cloudflare-ci": ["--template", "cloudflare", "--github-ci"],
  "wfp-dispatcher": ["--template", "cloudflare-wfp-dispatcher"],
  "wfp-tenant": ["--template", "cloudflare-wfp-tenant"],
  "control-plane": ["--template", "cloudflare-control-plane"],
  "aws-sst": ["--template", "aws-sst"],
  proxy: ["--template", "proxy"],
} as const;

type CaseName = keyof typeof cases;

let tempRoot: string;
const projects = {} as Record<CaseName, ScaffoldResult>;

beforeAll(async () => {
  tempRoot = makeTempDir();
  await Promise.all(
    (Object.keys(cases) as CaseName[]).map(async (name) => {
      projects[name] = await scaffold(name, [...cases[name]], tempRoot);
    }),
  );
}, 120_000);

afterAll(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
});

function expectValidEncryptionKey(content: string, varName: string) {
  const match = content.match(new RegExp(`^${varName}=(.+)$`, "m"));
  expect(match, `${varName} should be present`).toBeTruthy();
  const key = Buffer.from(match![1]!, "base64");
  expect(key.length, `${varName} should be a base64 32-byte key`).toBe(32);
}

describe("scaffolding succeeds for every template", () => {
  it.each(Object.keys(cases) as CaseName[])("%s exits 0", (name) => {
    const { exitCode, stderr } = projects[name];
    expect(exitCode, stderr).toBe(0);
  });

  it.each(Object.keys(cases) as CaseName[])(
    "%s writes a valid package.json",
    (name) => {
      const pkg = readJson(
        path.join(projects[name].projectPath, "package.json"),
      );
      expect(pkg.name).toBe(name);
      expect(pkg.scripts.dev).toBeTruthy();
    },
  );
});

describe("local template", () => {
  it("creates the expected files", () => {
    const { projectPath } = projects.local;
    for (const file of [
      "package.json",
      "tsconfig.json",
      ".env",
      "src/index.ts",
      "src/app.ts",
      "src/seed.ts",
      "src/migrate.ts",
      "scripts/generate-encryption-key.mjs",
      "scripts/decrypt-field.mjs",
    ]) {
      expect(exists(projectPath, file), `${file} should exist`).toBe(true);
    }
  });

  it("depends on the kysely adapter with published versions by default", () => {
    const pkg = readJson(path.join(projects.local.projectPath, "package.json"));
    expect(pkg.dependencies["@authhero/kysely-adapter"]).toBe("latest");
    expect(pkg.dependencies.authhero).toBe("latest");
    expect(pkg.dependencies["better-sqlite3"]).toBeTruthy();
  });

  it("enables the admin UI by default in non-interactive mode", () => {
    const pkg = readJson(path.join(projects.local.projectPath, "package.json"));
    expect(pkg.dependencies["@authhero/admin"]).toBeTruthy();
    expect(readFile(projects.local.projectPath, "src/app.ts")).toContain(
      "adminHandler",
    );
  });

  it("generates a .env with a valid at-rest encryption key", () => {
    expectValidEncryptionKey(
      readFile(projects.local.projectPath, ".env"),
      "ENCRYPTION_KEY",
    );
  });

  it("generates a single-tenant app and seed", () => {
    const { projectPath } = projects.local;
    const app = readFile(projectPath, "src/app.ts");
    expect(app).toContain("init(");
    expect(app).not.toContain("initMultiTenant");
    const seed = readFile(projectPath, "src/seed.ts");
    expect(seed).toContain(`tenantId: "main"`);
    expect(seed).toContain("isControlPlane: false");
  });
});

describe("local template with --workspace --multi-tenant", () => {
  it("uses workspace:* for all @authhero packages", () => {
    const pkg = readJson(
      path.join(projects["local-workspace-multi"].projectPath, "package.json"),
    );
    expect(pkg.dependencies.authhero).toBe("workspace:*");
    for (const [dep, version] of Object.entries(pkg.dependencies)) {
      if (dep.startsWith("@authhero/")) {
        expect(version, dep).toBe("workspace:*");
      }
    }
  });

  it("wires up multi-tenancy", () => {
    const { projectPath } = projects["local-workspace-multi"];
    const pkg = readJson(path.join(projectPath, "package.json"));
    expect(pkg.dependencies["@authhero/multi-tenancy"]).toBeTruthy();
    const app = readFile(projectPath, "src/app.ts");
    expect(app).toContain("initMultiTenant");
    expect(app).toContain("control_plane");
    const seed = readFile(projectPath, "src/seed.ts");
    expect(seed).toContain(`tenantId: "control_plane"`);
    expect(seed).toContain("isControlPlane: true");
  });
});

describe("local template with --conformance", () => {
  it("writes a conformance-config.json with the alias", () => {
    const { projectPath } = projects["local-conformance"];
    const config = readJson(path.join(projectPath, "conformance-config.json"));
    expect(config.alias).toBe("my-alias");
    expect(config.client.client_id).toBe("conformance-test");
  });

  it("seeds conformance clients and adds bcryptjs", () => {
    const { projectPath } = projects["local-conformance"];
    const pkg = readJson(path.join(projectPath, "package.json"));
    expect(pkg.dependencies.bcryptjs).toBeTruthy();
    const seed = readFile(projectPath, "src/seed.ts");
    expect(seed).toContain("conformance-test");
    expect(seed).toContain("/test/a/my-alias/callback");
  });
});

describe("cloudflare template", () => {
  it("creates wrangler + dev vars files", () => {
    const { projectPath } = projects.cloudflare;
    for (const file of [
      "wrangler.toml",
      "wrangler.local.toml",
      ".dev.vars",
      "drizzle.config.ts",
      "copy-assets.js",
      "seed-helper.js",
      "src/index.ts",
      "src/app.ts",
      "src/seed.ts",
    ]) {
      expect(exists(projectPath, file), `${file} should exist`).toBe(true);
    }
  });

  it("adds a generated ENCRYPTION_KEY to .dev.vars", () => {
    const devVars = readFile(projects.cloudflare.projectPath, ".dev.vars");
    expectValidEncryptionKey(devVars, "ENCRYPTION_KEY");
    expect(devVars).not.toContain("CONTROL_PLANE_ENCRYPTION_KEY");
  });

  it("depends on the drizzle adapter", () => {
    const pkg = readJson(
      path.join(projects.cloudflare.projectPath, "package.json"),
    );
    expect(pkg.dependencies["@authhero/drizzle"]).toBeTruthy();
    expect(pkg.devDependencies.wrangler).toBeTruthy();
  });
});

describe("cloudflare template with --github-ci", () => {
  it("creates workflows and semantic-release config", () => {
    const { projectPath } = projects["cloudflare-ci"];
    for (const file of [
      ".github/workflows/unit-tests.yml",
      ".github/workflows/deploy-dev.yml",
      ".github/workflows/release.yml",
      ".releaserc.json",
    ]) {
      expect(exists(projectPath, file), `${file} should exist`).toBe(true);
    }
    const pkg = readJson(path.join(projectPath, "package.json"));
    expect(pkg.devDependencies["semantic-release"]).toBeTruthy();
    expect(pkg.scripts["type-check"]).toBeTruthy();
    expect(pkg.scripts.test).toBeTruthy();
  });
});

describe("WFP dispatcher template", () => {
  it("gets wrangler.local.toml but no .dev.vars (no at-rest data)", () => {
    const { projectPath } = projects["wfp-dispatcher"];
    expect(exists(projectPath, "wrangler.local.toml")).toBe(true);
    expect(exists(projectPath, ".dev.vars")).toBe(false);
  });

  it("only depends on proxy + drizzle", () => {
    const pkg = readJson(
      path.join(projects["wfp-dispatcher"].projectPath, "package.json"),
    );
    expect(pkg.dependencies["@authhero/proxy"]).toBeTruthy();
    expect(pkg.dependencies["@authhero/drizzle"]).toBeTruthy();
    expect(pkg.dependencies.authhero).toBeUndefined();
  });
});

describe.each(["wfp-tenant", "control-plane"] as const)(
  "%s template",
  (name) => {
    it("generates both encryption keys in .dev.vars", () => {
      const devVars = readFile(projects[name].projectPath, ".dev.vars");
      expectValidEncryptionKey(devVars, "ENCRYPTION_KEY");
      expectValidEncryptionKey(devVars, "CONTROL_PLANE_ENCRYPTION_KEY");
    });

    it("depends on authhero + multi-tenancy + drizzle", () => {
      const pkg = readJson(
        path.join(projects[name].projectPath, "package.json"),
      );
      expect(pkg.dependencies.authhero).toBeTruthy();
      expect(pkg.dependencies["@authhero/multi-tenancy"]).toBeTruthy();
      expect(pkg.dependencies["@authhero/drizzle"]).toBeTruthy();
    });
  },
);

describe("aws-sst template", () => {
  it("creates the expected files", () => {
    const { projectPath } = projects["aws-sst"];
    for (const file of [
      "sst.config.ts",
      ".env",
      "src/index.ts",
      "src/app.ts",
      "src/seed.ts",
      "copy-assets.js",
    ]) {
      expect(exists(projectPath, file), `${file} should exist`).toBe(true);
    }
    expectValidEncryptionKey(readFile(projectPath, ".env"), "ENCRYPTION_KEY");
  });

  it("depends on the published aws adapter package name", () => {
    const { projectPath } = projects["aws-sst"];
    const pkg = readJson(path.join(projectPath, "package.json"));
    // The package on npm is @authhero/aws-adapter — @authhero/aws does not
    // exist and would fail `npm install` on every scaffolded project.
    expect(pkg.dependencies["@authhero/aws-adapter"]).toBeTruthy();
    expect(pkg.dependencies["@authhero/aws"]).toBeUndefined();
    expect(readFile(projectPath, "src/seed.ts")).toContain(
      `from "@authhero/aws-adapter"`,
    );
    expect(readFile(projectPath, "src/index.ts")).toContain(
      `from "@authhero/aws-adapter"`,
    );
  });
});

describe("proxy template", () => {
  it("creates a minimal static-config worker", () => {
    const { projectPath } = projects.proxy;
    expect(exists(projectPath, "wrangler.toml")).toBe(true);
    expect(exists(projectPath, "src/index.ts")).toBe(true);
    expect(exists(projectPath, "src/proxy.config.ts")).toBe(true);
    expect(exists(projectPath, ".env")).toBe(false);
    const pkg = readJson(path.join(projectPath, "package.json"));
    expect(pkg.dependencies["@authhero/proxy"]).toBeTruthy();
    expect(pkg.dependencies.authhero).toBeUndefined();
  });
});

describe("error handling", () => {
  it("fails when the target directory already exists", async () => {
    const dir = makeTempDir();
    try {
      fs.mkdirSync(path.join(dir, "taken"));
      const result = await scaffold("taken", ["--template", "local"], dir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain("already exists");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects an unknown template", async () => {
    const dir = makeTempDir();
    try {
      const result = await runCli(
        ["bad-template", "--template", "nope", "--yes"],
        dir,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain("Invalid template");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
