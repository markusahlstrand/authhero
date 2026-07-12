#!/usr/bin/env node

import { Command } from "commander";
import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

// Generate a base64-encoded 32-byte (AES-256) key for at-rest encryption of
// sensitive credential fields. Written into the scaffolded project's dev env
// file so encryption is enabled out of the box for local development.
function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

const program = new Command();

type SetupType =
  | "local"
  | "cloudflare"
  | "cloudflare-wfp-dispatcher"
  | "cloudflare-wfp-tenant"
  | "cloudflare-control-plane"
  | "aws-sst"
  | "proxy";
type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

interface CliOptions {
  template?: SetupType;
  packageManager?: PackageManager;
  skipInstall?: boolean;
  skipMigrate?: boolean;
  skipStart?: boolean;
  yes?: boolean;
  githubCi?: boolean;
  multiTenant?: boolean;
  adminUi?: boolean;
  conformance?: boolean;
  conformanceAlias?: string;
  workspace?: boolean;
}

interface SetupConfig {
  name: string;
  description: string;
  templateDir: string;
  packageJson: (
    projectName: string,
    multiTenant: boolean | undefined,
    conformance?: boolean,
    workspace?: boolean,
    adminUi?: boolean,
  ) => object;
  seedFile?: string;
}

const setupConfigs: Record<SetupType, SetupConfig> = {
  local: {
    name: "Local (SQLite)",
    description:
      "Local development setup with SQLite database - great for getting started",
    templateDir: "local",
    packageJson: (
      projectName,
      multiTenant,
      conformance,
      workspace,
      adminUi,
    ) => {
      const v = workspace ? "workspace:*" : "latest";
      return {
        name: projectName,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "npx tsx watch --env-file=.env src/index.ts",
          start: "npx tsx --env-file=.env src/index.ts",
          migrate: "npx tsx src/migrate.ts",
          seed: "npx tsx --env-file=.env src/seed.ts",
          "gen:key": "node scripts/generate-encryption-key.mjs",
          decrypt: "node --env-file=.env scripts/decrypt-field.mjs",
        },
        dependencies: {
          "@authhero/drizzle": v,
          ...(adminUi && { "@authhero/admin": v }),
          "@authhero/widget": v,
          "@hono/swagger-ui": "^0.6.0",
          "@hono/zod-openapi": "^1.4.0",
          "@hono/node-server": "latest",
          authhero: v,
          "better-sqlite3": "latest",
          "drizzle-orm": "^0.44.0",
          hono: "^4.12.0",
          ...(multiTenant && { "@authhero/multi-tenancy": v }),
          ...(conformance && { bcryptjs: "latest" }),
        },
        devDependencies: {
          "@types/better-sqlite3": "^7.6.0",
          "@types/node": "^22.0.0",
          tsx: "^4.0.0",
          typescript: "^5.9.0",
        },
      };
    },
    seedFile: "seed.ts",
  },
  cloudflare: {
    name: "Cloudflare Workers (D1)",
    description: "Cloudflare Workers setup with D1 database",
    templateDir: "cloudflare",
    packageJson: (
      projectName,
      multiTenant,
      conformance,
      workspace,
      adminUi,
    ) => {
      const v = workspace ? "workspace:*" : "latest";
      return {
        name: projectName,
        version: "1.0.0",
        type: "module",
        scripts: {
          postinstall: "node copy-assets.js",
          "copy-assets": "node copy-assets.js",
          dev: "node copy-assets.js && wrangler dev --port 3000 --local-protocol https",
          "dev:remote":
            "node copy-assets.js && wrangler dev --port 3000 --local-protocol https --remote --config wrangler.local.toml",
          deploy:
            "node copy-assets.js && wrangler deploy --config wrangler.local.toml",
          "db:migrate:local": "wrangler d1 migrations apply AUTH_DB --local",
          "db:migrate:remote":
            "wrangler d1 migrations apply AUTH_DB --remote --config wrangler.local.toml",
          migrate: "wrangler d1 migrations apply AUTH_DB --local",
          "seed:local": "node seed-helper.js",
          "seed:remote": "node seed-helper.js '' '' remote",
          seed: "node seed-helper.js",
          setup:
            "cp wrangler.toml wrangler.local.toml && cp .dev.vars.example .dev.vars && echo '✅ Created wrangler.local.toml and .dev.vars - update with your IDs'",
          "gen:key": "node scripts/generate-encryption-key.mjs",
          decrypt: "node --env-file=.dev.vars scripts/decrypt-field.mjs",
        },
        dependencies: {
          "@authhero/drizzle": v,
          ...(adminUi && { "@authhero/admin": v }),
          "@authhero/widget": v,
          "@hono/swagger-ui": "^0.6.0",
          "@hono/zod-openapi": "^1.4.0",
          authhero: v,
          "drizzle-orm": "^0.44.0",
          hono: "^4.12.0",
          ...(multiTenant && { "@authhero/multi-tenancy": v }),
          ...(conformance && { bcryptjs: "latest" }),
        },
        devDependencies: {
          "@cloudflare/workers-types": "^4.0.0",
          "drizzle-kit": "^0.31.0",
          typescript: "^5.9.0",
          wrangler: "^4.0.0",
        },
      };
    },
    seedFile: "seed.ts",
  },
  "cloudflare-wfp-dispatcher": {
    name: "Cloudflare Workers for Platforms — Dispatcher",
    description:
      "Thin dispatcher worker that routes per-publisher custom domains to tenant auth workers in a dispatch namespace (pair with the `cloudflare` template for tenant workers)",
    templateDir: "cloudflare-wfp-dispatcher",
    packageJson: (projectName, _multiTenant, _conformance, workspace) => {
      const v = workspace ? "workspace:*" : "latest";
      return {
        name: projectName,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "wrangler dev --port 3001 --local-protocol https",
          "dev:remote":
            "wrangler dev --port 3001 --local-protocol https --remote --config wrangler.local.toml",
          deploy: "wrangler deploy --config wrangler.local.toml",
          "db:migrate:local": "wrangler d1 migrations apply AUTH_DB --local",
          "db:migrate:remote":
            "wrangler d1 migrations apply AUTH_DB --remote --config wrangler.local.toml",
          migrate: "wrangler d1 migrations apply AUTH_DB --local",
          setup:
            "cp wrangler.toml wrangler.local.toml && echo '✅ Created wrangler.local.toml - update with your IDs'",
        },
        dependencies: {
          "@authhero/drizzle": v,
          "@authhero/proxy": v,
          "drizzle-orm": "^0.44.0",
          hono: "^4.12.0",
        },
        devDependencies: {
          "@cloudflare/workers-types": "^4.0.0",
          "drizzle-kit": "^0.31.0",
          typescript: "^5.9.0",
          wrangler: "^4.0.0",
        },
      };
    },
  },
  "cloudflare-wfp-tenant": {
    name: "Cloudflare Workers for Platforms — Tenant Worker",
    description:
      "Per-tenant authhero worker (own D1) that inherits control plane defaults via runtime fallback + keyed encryption (deploy into the dispatch namespace; pair with the control-plane template)",
    templateDir: "cloudflare-wfp-tenant",
    packageJson: (projectName, _multiTenant, _conformance, workspace) => {
      const v = workspace ? "workspace:*" : "latest";
      return {
        name: projectName,
        version: "1.0.0",
        type: "module",
        scripts: {
          postinstall: "node copy-assets.js",
          "copy-assets": "node copy-assets.js",
          dev: "node copy-assets.js && wrangler dev --port 3002 --local-protocol https",
          "dev:remote":
            "node copy-assets.js && wrangler dev --port 3002 --local-protocol https --remote --config wrangler.local.toml",
          deploy:
            "node copy-assets.js && wrangler deploy --config wrangler.local.toml",
          "db:migrate:local": "wrangler d1 migrations apply AUTH_DB --local",
          "db:migrate:remote":
            "wrangler d1 migrations apply AUTH_DB --remote --config wrangler.local.toml",
          migrate: "wrangler d1 migrations apply AUTH_DB --local",
          setup:
            "cp wrangler.toml wrangler.local.toml && cp .dev.vars.example .dev.vars && echo '✅ Created wrangler.local.toml and .dev.vars - update with your IDs and CONTROL_PLANE_ENCRYPTION_KEY'",
          "gen:key": "node scripts/generate-encryption-key.mjs",
          decrypt: "node --env-file=.dev.vars scripts/decrypt-field.mjs",
        },
        dependencies: {
          "@authhero/drizzle": v,
          "@authhero/multi-tenancy": v,
          "@authhero/widget": v,
          "@hono/swagger-ui": "^0.6.0",
          "@hono/zod-openapi": "^1.4.0",
          authhero: v,
          "drizzle-orm": "^0.44.0",
          hono: "^4.12.0",
        },
        devDependencies: {
          "@cloudflare/workers-types": "^4.0.0",
          "drizzle-kit": "^0.31.0",
          typescript: "^5.9.0",
          wrangler: "^4.0.0",
        },
      };
    },
  },
  "cloudflare-control-plane": {
    name: "Cloudflare Workers for Platforms — Control Plane",
    description:
      "Control plane worker: tenant management + rollout source that projects default connections/prompts/branding into each WFP tenant's database (pair with the dispatcher and tenant templates)",
    templateDir: "cloudflare-control-plane",
    packageJson: (projectName, _multiTenant, _conformance, workspace) => {
      const v = workspace ? "workspace:*" : "latest";
      return {
        name: projectName,
        version: "1.0.0",
        type: "module",
        scripts: {
          postinstall: "node copy-assets.js",
          "copy-assets": "node copy-assets.js",
          dev: "node copy-assets.js && wrangler dev --port 3000 --local-protocol https",
          "dev:remote":
            "node copy-assets.js && wrangler dev --port 3000 --local-protocol https --remote --config wrangler.local.toml",
          deploy:
            "node copy-assets.js && wrangler deploy --config wrangler.local.toml",
          "db:migrate:local": "wrangler d1 migrations apply AUTH_DB --local",
          "db:migrate:remote":
            "wrangler d1 migrations apply AUTH_DB --remote --config wrangler.local.toml",
          migrate: "wrangler d1 migrations apply AUTH_DB --local",
          "seed:local": "node seed-helper.js",
          "seed:remote": "node seed-helper.js '' '' remote",
          seed: "node seed-helper.js",
          setup:
            "cp wrangler.toml wrangler.local.toml && cp .dev.vars.example .dev.vars && echo '✅ Created wrangler.local.toml and .dev.vars - update with your IDs and CONTROL_PLANE_ENCRYPTION_KEY'",
          "gen:key": "node scripts/generate-encryption-key.mjs",
          decrypt: "node --env-file=.dev.vars scripts/decrypt-field.mjs",
        },
        dependencies: {
          "@authhero/drizzle": v,
          "@authhero/multi-tenancy": v,
          "@authhero/widget": v,
          "@hono/swagger-ui": "^0.6.0",
          "@hono/zod-openapi": "^1.4.0",
          authhero: v,
          "drizzle-orm": "^0.44.0",
          hono: "^4.12.0",
        },
        devDependencies: {
          "@cloudflare/workers-types": "^4.0.0",
          "drizzle-kit": "^0.31.0",
          typescript: "^5.9.0",
          wrangler: "^4.0.0",
        },
      };
    },
  },
  proxy: {
    name: "Proxy (Cloudflare Workers)",
    description:
      "Host-based reverse proxy on Cloudflare Workers — static config, no DB",
    templateDir: "proxy",
    packageJson: (projectName, _multiTenant, _conformance, workspace) => {
      const v = workspace ? "workspace:*" : "latest";
      return {
        name: projectName,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "wrangler dev --port 8787",
          deploy: "wrangler deploy",
          logs: "wrangler tail",
        },
        dependencies: {
          "@authhero/proxy": v,
          hono: "^4.12.0",
        },
        devDependencies: {
          "@cloudflare/workers-types": "^4.0.0",
          "@types/node": "^22.0.0",
          typescript: "^5.9.0",
          wrangler: "^4.0.0",
        },
      };
    },
  },
  "aws-sst": {
    name: "AWS SST (Lambda + DynamoDB)",
    description: "Serverless AWS deployment with Lambda, DynamoDB, and SST",
    templateDir: "aws-sst",
    packageJson: (
      projectName,
      multiTenant,
      conformance,
      workspace,
      adminUi,
    ) => {
      const v = workspace ? "workspace:*" : "latest";
      return {
        name: projectName,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "sst dev",
          deploy: "sst deploy --stage production",
          remove: "sst remove",
          seed: "npx tsx --env-file=.env src/seed.ts",
          "copy-assets": "node copy-assets.js",
          "gen:key": "node scripts/generate-encryption-key.mjs",
          decrypt: "node --env-file=.env scripts/decrypt-field.mjs",
        },
        dependencies: {
          "@authhero/aws-adapter": v,
          ...(adminUi && { "@authhero/admin": v }),
          "@authhero/widget": v,
          "@aws-sdk/client-dynamodb": "^3.0.0",
          "@aws-sdk/lib-dynamodb": "^3.0.0",
          "@hono/swagger-ui": "^0.6.0",
          "@hono/zod-openapi": "^1.4.0",
          authhero: v,
          hono: "^4.12.0",
          ...(multiTenant && { "@authhero/multi-tenancy": v }),
          ...(conformance && { bcryptjs: "latest" }),
        },
        devDependencies: {
          "@types/aws-lambda": "^8.10.0",
          "@types/node": "^22.0.0",
          sst: "^3.0.0",
          tsx: "^4.0.0",
          typescript: "^5.9.0",
        },
      };
    },
    seedFile: "seed.ts",
  },
};

function copyFiles(source: string, target: string): void {
  const files = fs.readdirSync(source);
  files.forEach((file) => {
    const sourceFile = path.join(source, file);
    const targetFile = path.join(target, file);
    if (fs.lstatSync(sourceFile).isDirectory()) {
      fs.mkdirSync(targetFile, { recursive: true });
      copyFiles(sourceFile, targetFile);
    } else {
      fs.copyFileSync(sourceFile, targetFile);
    }
  });
}

function generateLocalSeedFileContent(
  multiTenant: boolean | undefined,
  conformance: boolean = false,
  conformanceAlias: string = "authhero-local",
  adminUi?: boolean,
): string {
  const tenantId = multiTenant ? "control_plane" : "main";
  const tenantName = multiTenant ? "Control Plane" : "Main";

  // Build callbacks array
  const defaultCallbacks = [
    "https://manage.authhero.net/auth-callback",
    "https://local.authhero.net/auth-callback",
    "http://localhost:5173/auth-callback",
    "http://localhost:3000/auth-callback",
    "https://localhost:3000/auth-callback",
    ...(adminUi
      ? [
          "http://localhost:3000/admin/auth-callback",
          "https://localhost:3000/admin/auth-callback",
        ]
      : []),
  ];
  const conformanceCallbacks = conformance
    ? [
        `https://localhost.emobix.co.uk:8443/test/a/${conformanceAlias}/callback`,
        `https://localhost:8443/test/a/${conformanceAlias}/callback`,
      ]
    : [];
  const callbacks = [...defaultCallbacks, ...conformanceCallbacks];

  const defaultLogoutUrls = [
    "https://manage.authhero.net",
    "https://local.authhero.net",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://localhost:3000",
  ];
  const conformanceLogoutUrls = conformance
    ? ["https://localhost:8443/", "https://localhost.emobix.co.uk:8443/"]
    : [];
  const allowedLogoutUrls = [...defaultLogoutUrls, ...conformanceLogoutUrls];

  // Generate conformance client creation code
  const conformanceClientCode = conformance
    ? `
  // Create OpenID Conformance Suite test clients and user
  console.log("Creating conformance test clients and user...");

  // The OIDCC basic test plan calls /token without an audience param. AuthHero
  // requires either an explicit audience or a tenant default_audience to mint
  // an access token, so set one here for the conformance setup.
  // enable_dynamic_client_registration is required by the OIDCC dynamic plan,
  // which has the suite register its own client via /oidc/register. The
  // OIDCC dynamic_client variant uses open DCR (no Initial Access Token), so
  // dcr_require_initial_access_token must be flipped off — the AuthHero
  // default is to require an IAT. Existing flags (e.g.
  // inherit_global_permissions_in_organizations set by seed for the
  // control-plane tenant) are merged in so the update doesn't clobber.
  const existingTenant = await adapters.tenants.get("${tenantId}");
  await adapters.tenants.update("${tenantId}", {
    default_audience: "urn:authhero:management",
    flags: {
      ...(existingTenant?.flags ?? {}),
      enable_dynamic_client_registration: true,
      dcr_require_initial_access_token: false,
    },
  });
  console.log("✅ Set tenant default_audience and enabled DCR for conformance");

  const conformanceCallbacks = [
    "https://localhost.emobix.co.uk:8443/test/a/${conformanceAlias}/callback",
    "https://localhost:8443/test/a/${conformanceAlias}/callback",
  ];
  const conformanceLogoutUrls = [
    "https://localhost:8443/",
    "https://localhost.emobix.co.uk:8443/",
  ];
  const conformanceWebOrigins = [
    "https://localhost:8443",
    "https://localhost.emobix.co.uk:8443",
  ];

  // Strict OIDC 5.4: scope-driven claims (profile/email/address/phone) belong
  // in /userinfo whenever an access_token is co-issued at /authorize. The OIDF
  // suite enforces this via EnsureIdTokenDoesNotContainEmailForScopeEmail;
  // running the conformance tenant under Auth0-compatible defaults would WARN.
  const conformanceClientSpecs = [
    {
      client_id: "conformance-test",
      client_secret: "conformanceTestSecret123",
      name: "Conformance Test Client",
    },
    {
      client_id: "conformance-test2",
      client_secret: "conformanceTestSecret456",
      name: "Conformance Test Client 2",
    },
  ];
  for (const spec of conformanceClientSpecs) {
    const desired = {
      name: spec.name,
      client_secret: spec.client_secret,
      callbacks: conformanceCallbacks,
      allowed_logout_urls: conformanceLogoutUrls,
      web_origins: conformanceWebOrigins,
      auth0_conformant: false,
    };
    // Idempotent reconcile: prior runs may have created the client with stale
    // callbacks/web_origins after this seed file was changed. Update existing
    // records in place rather than just logging "already exists".
    const existing = await adapters.clients.get("${tenantId}", spec.client_id);
    if (existing) {
      await adapters.clients.update("${tenantId}", spec.client_id, desired);
      console.log(\`🔄 Updated \${spec.client_id} client\`);
    } else {
      await adapters.clients.create("${tenantId}", {
        client_id: spec.client_id,
        ...desired,
      });
      console.log(\`✅ Created \${spec.client_id} client\`);
    }
  }

  // Create a conformance test user with ALL OIDC profile claims populated
  // This is required for OIDCC-5.4 (VerifyScopesReturnedInUserInfoClaims) test
  try {
    await adapters.users.create("${tenantId}", {
      user_id: \`\${USERNAME_PASSWORD_PROVIDER}|conformance-user\`,
      email: "conformance@example.com",
      email_verified: true,
      name: "Conformance Test User",
      given_name: "Conformance",
      family_name: "User",
      middle_name: "Test",
      nickname: "conformance",
      username: "conformance_user",
      picture: "https://example.com/conformance.png",
      profile: "https://example.com/conformance",
      website: "https://example.com",
      gender: "other",
      birthdate: "2000-01-01",
      zoneinfo: "Europe/London",
      locale: "en-US",
      connection: "Username-Password-Authentication",
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
    });
    console.log("✅ Created conformance test user (conformance@example.com)");
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint")) {
      console.log("ℹ️  conformance test user already exists");
    } else {
      throw e;
    }
  }

  // Create password for conformance test user
  // Password: ConformanceTest123!
  try {
    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash("ConformanceTest123!", 10);
    await adapters.passwords.create("${tenantId}", {
      user_id: \`\${USERNAME_PASSWORD_PROVIDER}|conformance-user\`,
      password: hashedPassword,
    });
    console.log("✅ Created password for conformance test user");
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint")) {
      console.log("ℹ️  conformance test user password already exists");
    } else {
      throw e;
    }
  }
`
    : "";

  // TypeScript seed file for local setup - uses the seed function from authhero
  return `import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import { seed, createEncryptedDataAdapter, loadEncryptionKey${conformance ? ", USERNAME_PASSWORD_PROVIDER" : ""} } from "authhero";

interface ExtraClient {
  client_id: string;
  client_secret: string;
  name?: string;
  callbacks?: string[];
  allowed_logout_urls?: string[];
  web_origins?: string[];
  auth0_conformant?: boolean;
  oidc_logout?: {
    backchannel_logout_urls?: string[];
  };
}

function parseFlag(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const eqPrefix = \`--\${name}=\`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === \`--\${name}\`) return argv[i + 1];
    if (arg.startsWith(eqPrefix)) return arg.slice(eqPrefix.length);
  }
  return undefined;
}

function positionalArgs(): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      if (!arg.includes("=")) i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

async function main() {
  const positional = positionalArgs();
  const adminUsername = positional[0] || process.env.ADMIN_USERNAME || "admin";
  const adminPassword = positional[1] || process.env.ADMIN_PASSWORD || "admin";

  const clientsJson = parseFlag("clients");
  const userProfileJson = parseFlag("user-profile");
  const extraClients: ExtraClient[] = clientsJson ? JSON.parse(clientsJson) : [];
  const userProfile: Record<string, unknown> = userProfileJson
    ? JSON.parse(userProfileJson)
    : {};

  const sqlite = new Database("db.sqlite");
  const db = drizzle(sqlite, { schema });
  let adapters = createAdapters(db);

  // Match the server: encrypt seeded secrets at rest when a key is configured.
  if (process.env.ENCRYPTION_KEY) {
    const encryptionKey = await loadEncryptionKey(process.env.ENCRYPTION_KEY);
    adapters = createEncryptedDataAdapter(adapters, encryptionKey);
  }

  const seedResult = await seed(adapters, {
    adminUsername,
    adminPassword,
    tenantId: "${tenantId}",
    tenantName: "${tenantName}",
    isControlPlane: ${!!multiTenant},
    clientId: "default",
    callbacks: ${JSON.stringify(callbacks)},
    allowedLogoutUrls: ${JSON.stringify(allowedLogoutUrls)},
  });

  for (const c of extraClients) {
    const existing = await adapters.clients.get(seedResult.tenantId, c.client_id);
    if (existing) {
      console.log(\`Client "\${c.client_id}" already exists, skipping...\`);
      continue;
    }
    await adapters.clients.create(seedResult.tenantId, {
      client_id: c.client_id,
      client_secret: c.client_secret,
      name: c.name ?? c.client_id,
      callbacks: c.callbacks ?? [],
      allowed_logout_urls: c.allowed_logout_urls ?? [],
      web_origins: c.web_origins ?? [],
      connections: ["Username-Password-Authentication"],
      client_metadata: { universal_login_version: "2" },
      ...(c.auth0_conformant !== undefined && {
        auth0_conformant: c.auth0_conformant,
      }),
      ...(c.oidc_logout !== undefined && { oidc_logout: c.oidc_logout }),
    });
    console.log(\`✅ Created client "\${c.client_id}"\`);
  }

  if (Object.keys(userProfile).length > 0) {
    await adapters.users.update(seedResult.tenantId, seedResult.userId, userProfile);
    console.log(\`✅ Updated profile of user "\${seedResult.username}"\`);
  }
${conformanceClientCode}
  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
}

function generateLocalAppFileContent(
  multiTenant: boolean | undefined,
  adminUi?: boolean,
): string {
  const adminImports = adminUi ? `import fs from "fs";\n` : "";
  const adminPaths = adminUi
    ? `
const adminDistPath = path.resolve(
  __dirname,
  "../node_modules/@authhero/admin/dist",
);
const adminIndexPath = path.join(adminDistPath, "index.html");
`
    : "";

  // Build admin UI handler code block
  const adminHandlerCode = adminUi
    ? `
  // Add admin UI handler if the package is installed
  if (fs.existsSync(adminIndexPath)) {
    const issuer =
      process.env.ISSUER || \`https://localhost:\${process.env.PORT || 3000}/\`;
    const rawHtml = fs.readFileSync(adminIndexPath, "utf-8")
      .replace(/src="\\.\\//g, 'src="/admin/')
      .replace(/href="\\.\\//g, 'href="/admin/');
    const configJson = JSON.stringify({
      domain: issuer.replace(/\\/$/, ""),
      clientId: ${multiTenant ? "CONTROL_PLANE_CLIENT_ID," : `"default",`}
      basePath: "/admin",
    }).replace(/</g, "\\\\u003c");
    configWithHandlers.adminIndexHtml = rawHtml.replace(
      "</head>",
      \`<script>window.__AUTHHERO_ADMIN_CONFIG__=\${configJson};</script>\\n</head>\`,
    );
    configWithHandlers.adminHandler = serveStatic({
      root: adminDistPath,
      rewriteRequestPath: (p: string) => p.replace("/admin", ""),
    });
  }
`
    : "";

  if (multiTenant) {
    return `import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { AuthHeroConfig, DataAdapters } from "authhero";
import { serveStatic } from "@hono/node-server/serve-static";
import { initMultiTenant } from "@authhero/multi-tenancy";
import path from "path";
${adminImports}import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const widgetPath = path.resolve(
  __dirname,
  "../node_modules/@authhero/widget/dist/authhero-widget",
);
${adminPaths}
// Control plane configuration
const CONTROL_PLANE_TENANT_ID = "control_plane";
const CONTROL_PLANE_CLIENT_ID = "default";

export default function createApp(config: AuthHeroConfig & { dataAdapter: DataAdapters }) {
  const configWithHandlers: AuthHeroConfig & { dataAdapter: DataAdapters } = {
    ...config,
    widgetHandler: serveStatic({
      root: widgetPath,
      rewriteRequestPath: (p) => p.replace("/u/widget", ""),
    }),
  };
${adminHandlerCode}
  // Initialize multi-tenant AuthHero - syncs resource servers, roles, and connections by default
  const { app } = initMultiTenant({
    ...configWithHandlers,
    controlPlane: {
      tenantId: CONTROL_PLANE_TENANT_ID,
      clientId: CONTROL_PLANE_CLIENT_ID,
    },
  });

  app
    .onError((err, ctx) => {
      // Use duck-typing to avoid instanceof issues with bundled dependencies
      if (err && typeof err === "object" && "getResponse" in err) {
        return (err as { getResponse: () => Response }).getResponse();
      }
      console.error(err);
      return ctx.text(err instanceof Error ? err.message : "Internal Server Error", 500);
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Multi-Tenant Server",
        version: "1.0.0",
        status: "running",
        docs: "/docs",
        controlPlaneTenant: CONTROL_PLANE_TENANT_ID,
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
`;
  }

  return `import { Context } from "hono";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "path";
${adminImports}import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const widgetPath = path.resolve(
  __dirname,
  "../node_modules/@authhero/widget/dist/authhero-widget",
);
${adminPaths}
export default function createApp(config: AuthHeroConfig) {
  const configWithHandlers: AuthHeroConfig = {
    ...config,
    widgetHandler: serveStatic({
      root: widgetPath,
      rewriteRequestPath: (p) => p.replace("/u/widget", ""),
    }),
  };
${adminHandlerCode}
  const { app } = init(configWithHandlers);

  app
    .onError((err, ctx) => {
      // Use duck-typing to avoid instanceof issues with bundled dependencies
      if (err && typeof err === "object" && "getResponse" in err) {
        return (err as { getResponse: () => Response }).getResponse();
      }
      console.error(err);
      return ctx.text(err instanceof Error ? err.message : "Internal Server Error", 500);
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Server",
        status: "running",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
`;
}

function generateCloudflareSeedFileContent(
  multiTenant: boolean | undefined,
): string {
  const tenantId = multiTenant ? "control_plane" : "main";
  const tenantName = multiTenant ? "Control Plane" : "Main";

  return `import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import { seed, createEncryptedDataAdapter, loadEncryptionKey } from "authhero";

interface Env {
  AUTH_DB: D1Database;
  ENCRYPTION_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const adminUsername = url.searchParams.get("username") || "admin";
    const adminPassword = url.searchParams.get("password") || "admin";
    // Compute issuer from the request URL (for Management API identifier)
    const issuer = \`\${url.protocol}//\${url.host}/\`;

    try {
      const db = drizzle(env.AUTH_DB, { schema });
      let adapters = createAdapters(db, { useTransactions: false });

      if (env.ENCRYPTION_KEY) {
        const encryptionKey = await loadEncryptionKey(env.ENCRYPTION_KEY);
        adapters = createEncryptedDataAdapter(adapters, encryptionKey);
      }

      const result = await seed(adapters, {
        adminUsername,
        adminPassword,
        issuer,
        tenantId: "${tenantId}",
        tenantName: "${tenantName}",
        isControlPlane: ${!!multiTenant},
        clientId: "default",
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Database seeded successfully",
          result,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Seed error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to seed database",
          message: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
`;
}

function generateCloudflareAppFileContent(
  multiTenant: boolean | undefined,
  adminUi?: boolean,
): string {
  const adminImport = adminUi
    ? `import adminIndexHtml from "./admin-index-html";\n`
    : "";
  const adminConfig = adminUi ? `    adminIndexHtml,\n` : "";

  if (multiTenant) {
    return `import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { AuthHeroConfig, DataAdapters } from "authhero";
import { initMultiTenant } from "@authhero/multi-tenancy";
${adminImport}
// Control plane configuration
const CONTROL_PLANE_TENANT_ID = "control_plane";
const CONTROL_PLANE_CLIENT_ID = "default";

export default function createApp(config: AuthHeroConfig & { dataAdapter: DataAdapters }) {
  // Initialize multi-tenant AuthHero - syncs resource servers, roles, and connections by default
  const { app } = initMultiTenant({
    ...config,
${adminConfig}    controlPlane: {
      tenantId: CONTROL_PLANE_TENANT_ID,
      clientId: CONTROL_PLANE_CLIENT_ID,
    },
  });

  app
    .onError((err, ctx) => {
      // Use duck-typing to avoid instanceof issues with bundled dependencies
      if (err && typeof err === "object" && "getResponse" in err) {
        return (err as { getResponse: () => Response }).getResponse();
      }
      console.error(err);
      return ctx.text(err instanceof Error ? err.message : "Internal Server Error", 500);
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Multi-Tenant Server",
        version: "1.0.0",
        status: "running",
        docs: "/docs",
        controlPlaneTenant: CONTROL_PLANE_TENANT_ID,
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
`;
  }

  return `import { Context } from "hono";
import { cors } from "hono/cors";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
${adminImport}
export default function createApp(config: AuthHeroConfig) {
  const { app } = init({
    ...config,
${adminConfig}  });

  // Enable CORS for all origins in development
  app.use("*", cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Auth0-Client"],
    exposeHeaders: ["Content-Length"],
    credentials: true,
  }));

  app
    .onError((err, ctx) => {
      // Use duck-typing to avoid instanceof issues with bundled dependencies
      if (err && typeof err === "object" && "getResponse" in err) {
        return (err as { getResponse: () => Response }).getResponse();
      }
      console.error(err);
      return ctx.text(err instanceof Error ? err.message : "Internal Server Error", 500);
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Server",
        status: "running",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
`;
}

function generateAwsSstAppFileContent(
  multiTenant: boolean | undefined,
): string {
  if (multiTenant) {
    return `import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { AuthHeroConfig, DataAdapters } from "authhero";
import { initMultiTenant } from "@authhero/multi-tenancy";

// Control plane configuration
const CONTROL_PLANE_TENANT_ID = "control_plane";
const CONTROL_PLANE_CLIENT_ID = "default";

interface AppConfig extends AuthHeroConfig {
  dataAdapter: DataAdapters;
  widgetUrl: string;
}

export default function createApp(config: AppConfig) {
  // Initialize multi-tenant AuthHero
  const { app } = initMultiTenant({
    ...config,
    controlPlane: {
      tenantId: CONTROL_PLANE_TENANT_ID,
      clientId: CONTROL_PLANE_CLIENT_ID,
    },
  });

  app
    .onError((err, ctx) => {
      if (err && typeof err === "object" && "getResponse" in err) {
        return (err as { getResponse: () => Response }).getResponse();
      }
      console.error(err);
      return ctx.text(err instanceof Error ? err.message : "Internal Server Error", 500);
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Multi-Tenant Server (AWS)",
        version: "1.0.0",
        status: "running",
        docs: "/docs",
        controlPlaneTenant: CONTROL_PLANE_TENANT_ID,
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }))
    // Redirect widget requests to S3/CloudFront
    .get("/u/widget/*", async (ctx) => {
      const file = ctx.req.path.replace("/u/widget/", "");
      return ctx.redirect(\`\${config.widgetUrl}/u/widget/\${file}\`);
    })
    .get("/u/*", async (ctx) => {
      const file = ctx.req.path.replace("/u/", "");
      return ctx.redirect(\`\${config.widgetUrl}/u/\${file}\`);
    });

  return app;
}
`;
  }

  return `import { Context } from "hono";
import { cors } from "hono/cors";
import { AuthHeroConfig, init, DataAdapters } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";

interface AppConfig extends AuthHeroConfig {
  dataAdapter: DataAdapters;
  widgetUrl: string;
}

export default function createApp(config: AppConfig) {
  const { app } = init(config);

  // Enable CORS for all origins in development
  app.use("*", cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Auth0-Client"],
    exposeHeaders: ["Content-Length"],
    credentials: true,
  }));

  app
    .onError((err, ctx) => {
      if (err && typeof err === "object" && "getResponse" in err) {
        return (err as { getResponse: () => Response }).getResponse();
      }
      console.error(err);
      return ctx.text(err instanceof Error ? err.message : "Internal Server Error", 500);
    })
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Server (AWS)",
        status: "running",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }))
    // Redirect widget requests to S3/CloudFront
    .get("/u/widget/*", async (ctx) => {
      const file = ctx.req.path.replace("/u/widget/", "");
      return ctx.redirect(\`\${config.widgetUrl}/u/widget/\${file}\`);
    })
    .get("/u/*", async (ctx) => {
      const file = ctx.req.path.replace("/u/", "");
      return ctx.redirect(\`\${config.widgetUrl}/u/\${file}\`);
    });

  return app;
}
`;
}

function generateAwsSstSeedFileContent(
  multiTenant: boolean | undefined,
): string {
  const tenantId = multiTenant ? "control_plane" : "main";
  const tenantName = multiTenant ? "Control Plane" : "Main";

  return `import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws-adapter";
import { seed, createEncryptedDataAdapter, loadEncryptionKey } from "authhero";

async function main() {
  const adminUsername = process.argv[2] || process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.argv[3] || process.env.ADMIN_PASSWORD || "admin";
  const tableName = process.argv[4] || process.env.TABLE_NAME;

  if (!tableName) {
    console.error("TABLE_NAME environment variable is required");
    console.error("Run 'sst dev' first to get the table name from outputs");
    process.exit(1);
  }

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  let adapters = createAdapters(docClient, { tableName });

  if (process.env.ENCRYPTION_KEY) {
    const encryptionKey = await loadEncryptionKey(process.env.ENCRYPTION_KEY);
    adapters = createEncryptedDataAdapter(adapters, encryptionKey);
  }

  await seed(adapters, {
    adminUsername,
    adminPassword,
    tenantId: "${tenantId}",
    tenantName: "${tenantName}",
    isControlPlane: ${!!multiTenant},
  });

  console.log("✅ Database seeded successfully!");
}

main().catch(console.error);
`;
}

function generateAwsSstFiles(
  projectPath: string,
  multiTenant: boolean | undefined,
): void {
  const srcDir = path.join(projectPath, "src");

  // Generate app.ts
  fs.writeFileSync(
    path.join(srcDir, "app.ts"),
    generateAwsSstAppFileContent(multiTenant),
  );

  // Generate seed.ts
  fs.writeFileSync(
    path.join(srcDir, "seed.ts"),
    generateAwsSstSeedFileContent(multiTenant),
  );

  // Generate .env with a random encryption key. SST loads .env into the
  // config's process.env, which forwards ENCRYPTION_KEY to the Lambda. Keep
  // this key stable and use a separate one per deployment stage.
  fs.writeFileSync(
    path.join(projectPath, ".env"),
    `# At-rest encryption key for sensitive credentials. Generated automatically.
# Keep this stable and secret — losing it makes encrypted data unrecoverable.
ENCRYPTION_KEY=${generateEncryptionKey()}
`,
  );
}

function printAwsSstSuccessMessage(): void {
  console.log("\\n" + "─".repeat(50));
  console.log("🔐 AuthHero deployed to AWS!");
  console.log("📚 Check SST output for your API URL");
  console.log("🚀 Open your server URL /setup to complete initial setup");
  console.log("🌐 Portal available at https://local.authhero.net");
  console.log("─".repeat(50) + "\\n");
}

function createGithubWorkflows(projectPath: string): void {
  const workflowsDir = path.join(projectPath, ".github", "workflows");
  fs.mkdirSync(workflowsDir, { recursive: true });

  // Unit tests workflow - runs on all pushes
  const unitTestsYml = `name: Unit tests

on: push

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - run: npm run type-check
      - run: npm test
`;

  // Deploy to dev workflow - runs on push to main
  const deployDevYml = `name: Deploy to Dev

on:
  push:
    branches:
      - main

jobs:
  release:
    name: Release and Deploy
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Release
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: npx semantic-release

      - name: Deploy to Cloudflare (Dev)
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
`;

  // Release to production workflow - runs on GitHub release
  const releaseYml = `name: Deploy to Production

on:
  release:
    types: ["released"]

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Deploy to Cloudflare (Production)
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.PROD_CLOUDFLARE_API_TOKEN }}
          command: deploy --env production
`;

  fs.writeFileSync(path.join(workflowsDir, "unit-tests.yml"), unitTestsYml);
  fs.writeFileSync(path.join(workflowsDir, "deploy-dev.yml"), deployDevYml);
  fs.writeFileSync(path.join(workflowsDir, "release.yml"), releaseYml);

  console.log("\\n📦 GitHub CI workflows created!");
}

function addSemanticReleaseConfig(projectPath: string): void {
  // Add .releaserc.json for semantic-release configuration
  const releaseConfig = {
    branches: ["main"],
    plugins: [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator",
      "@semantic-release/github",
    ],
  };

  fs.writeFileSync(
    path.join(projectPath, ".releaserc.json"),
    JSON.stringify(releaseConfig, null, 2),
  );

  // Read and update package.json to add semantic-release and test script
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "semantic-release": "^24.0.0",
  };

  // Add test and type-check scripts if not present
  packageJson.scripts = {
    ...packageJson.scripts,
    test: 'echo "No tests yet"',
    "type-check": "tsc --noEmit",
  };

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

function runCommand(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd,
      shell: true,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

/**
 * Generates app.ts and seed.ts files for cloudflare setup based on multi-tenant flag
 */
function generateCloudflareFiles(
  projectPath: string,
  multiTenant: boolean | undefined,
  adminUi?: boolean,
): void {
  const srcDir = path.join(projectPath, "src");

  // Generate app.ts
  fs.writeFileSync(
    path.join(srcDir, "app.ts"),
    generateCloudflareAppFileContent(multiTenant, adminUi),
  );

  // Generate seed.ts
  fs.writeFileSync(
    path.join(srcDir, "seed.ts"),
    generateCloudflareSeedFileContent(multiTenant),
  );
}

/**
 * Prints nice output at the end of setup for cloudflare
 */
function printCloudflareSuccessMessage(): void {
  console.log("\n" + "─".repeat(50));
  console.log("🔐 AuthHero server running at https://localhost:3000");
  console.log("🚀 Open https://localhost:3000/setup to complete initial setup");
  console.log("─".repeat(50) + "\n");
}

/**
 * Prints nice output at the end of setup for the WFP dispatcher template
 */
function printCloudflareWfpDispatcherSuccessMessage(): void {
  console.log("\n" + "─".repeat(50));
  console.log("🛰️  WFP dispatcher running at https://localhost:3001");
  console.log(
    "📦 Pair with the `cloudflare` template to deploy tenant workers:",
  );
  console.log(
    "   wrangler deploy --dispatch-namespace=authhero-tenants --name=tenant-<id>-auth",
  );
  console.log("📖 See README.md for the full onboarding workflow");
  console.log("─".repeat(50) + "\n");
}

/**
 * Prints nice output at the end of setup for the WFP tenant template
 */
function printCloudflareWfpTenantSuccessMessage(): void {
  console.log("\n" + "─".repeat(50));
  console.log("🏠 WFP tenant worker running at https://localhost:3002");
  console.log("🔑 Set CONTROL_PLANE_ENCRYPTION_KEY in .dev.vars to match the");
  console.log("   control plane, then run the control plane's sync-defaults.");
  console.log("📦 Deploy into the namespace:");
  console.log(
    "   wrangler deploy --dispatch-namespace=authhero-tenants --name=tenant-<id>-auth",
  );
  console.log("─".repeat(50) + "\n");
}

/**
 * Prints nice output at the end of setup for the control plane template
 */
function printCloudflareControlPlaneSuccessMessage(): void {
  console.log("\n" + "─".repeat(50));
  console.log("🛰️  Control plane running at https://localhost:3000");
  console.log("🚀 Open https://localhost:3000/setup to complete initial setup");
  console.log(
    "🔁 Project defaults into a tenant: POST /internal/tenants/:id/sync-defaults",
  );
  console.log(
    "   (wire buildTenantAdapters() in src/index.ts and protect the route first)",
  );
  console.log("─".repeat(50) + "\n");
}

/**
 * Prints nice output at the end of setup for the proxy template
 */
function printProxySuccessMessage(): void {
  console.log("\n" + "─".repeat(50));
  console.log("🛰️  AuthHero proxy running at http://localhost:8787");
  console.log("✏️  Edit src/proxy.config.ts to add hosts and routes");
  console.log("📖 See README.md for deployment instructions");
  console.log("─".repeat(50) + "\n");
}

/**
 * Prints nice output at the end of setup for local/sqlite
 */
function printLocalSuccessMessage(adminUi?: boolean): void {
  console.log("\n" + "─".repeat(50));
  console.log("🔐 AuthHero server running at https://localhost:3000");
  console.log("⚠️  Uses a self-signed certificate — you may need to trust it");
  console.log("📚 API documentation available at https://localhost:3000/docs");
  console.log("🚀 Open https://localhost:3000/setup to complete initial setup");
  if (adminUi) {
    console.log("🛠️  Admin UI available at https://localhost:3000/admin");
  } else {
    console.log("🌐 Portal available at https://local.authhero.net");
  }
  console.log("─".repeat(50) + "\n");
}

program
  .version("1.0.0")
  .description("Create a new AuthHero project")
  .argument("[project-name]", "name of the project")
  .option(
    "-t, --template <type>",
    "template type: local, cloudflare, aws-sst, or proxy",
  )
  .option(
    "--package-manager <pm>",
    "package manager to use: npm, yarn, pnpm, or bun",
  )
  .option("--multi-tenant", "enable multi-tenant mode")
  .option("--admin-ui", "include admin UI at /admin")
  .option("--skip-install", "skip installing dependencies")
  .option("--skip-migrate", "skip running database migrations")
  .option("--skip-start", "skip starting the development server")
  .option("--github-ci", "include GitHub CI workflows with semantic versioning")
  .option("--conformance", "add OpenID conformance suite test clients")
  .option(
    "--conformance-alias <alias>",
    "alias for conformance suite (default: authhero-local)",
  )
  .option(
    "--workspace",
    "use workspace:* dependencies for local monorepo development",
  )
  .option("-y, --yes", "skip all prompts and use defaults/provided options")
  .action(async (projectNameArg, options: CliOptions) => {
    // Only be fully non-interactive when --yes is explicitly passed
    const isNonInteractive = options.yes === true;

    console.log("\n🔐 Welcome to AuthHero!\n");

    let projectName = projectNameArg;

    if (!projectName) {
      if (isNonInteractive) {
        projectName = "auth-server";
        console.log(`Using default project name: ${projectName}`);
      } else {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "projectName",
            message: "Project name:",
            default: "auth-server",
            validate: (input: string) =>
              input !== "" || "Project name cannot be empty",
          },
        ]);
        projectName = answers.projectName;
      }
    }

    const projectPath = path.join(process.cwd(), projectName);

    if (fs.existsSync(projectPath)) {
      console.error(`❌ Project "${projectName}" already exists.`);
      process.exit(1);
    }

    // Validate template option if provided
    let setupType: SetupType;
    if (options.template) {
      if (
        ![
          "local",
          "cloudflare",
          "cloudflare-wfp-dispatcher",
          "cloudflare-wfp-tenant",
          "cloudflare-control-plane",
          "aws-sst",
          "proxy",
        ].includes(options.template)
      ) {
        console.error(`❌ Invalid template: ${options.template}`);
        console.error(
          "Valid options: local, cloudflare, cloudflare-wfp-dispatcher, cloudflare-wfp-tenant, cloudflare-control-plane, aws-sst, proxy",
        );
        process.exit(1);
      }
      setupType = options.template;
      console.log(`Using template: ${setupConfigs[setupType].name}`);
    } else {
      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "setupType",
          message: "Select your setup type:",
          choices: [
            {
              name: `${setupConfigs.local.name}\n     ${setupConfigs.local.description}`,
              value: "local",
              short: setupConfigs.local.name,
            },
            {
              name: `${setupConfigs.cloudflare.name}\n     ${setupConfigs.cloudflare.description}`,
              value: "cloudflare",
              short: setupConfigs.cloudflare.name,
            },
            {
              name: `${setupConfigs["cloudflare-wfp-dispatcher"].name}\n     ${setupConfigs["cloudflare-wfp-dispatcher"].description}`,
              value: "cloudflare-wfp-dispatcher",
              short: setupConfigs["cloudflare-wfp-dispatcher"].name,
            },
            {
              name: `${setupConfigs["cloudflare-control-plane"].name}\n     ${setupConfigs["cloudflare-control-plane"].description}`,
              value: "cloudflare-control-plane",
              short: setupConfigs["cloudflare-control-plane"].name,
            },
            {
              name: `${setupConfigs["cloudflare-wfp-tenant"].name}\n     ${setupConfigs["cloudflare-wfp-tenant"].description}`,
              value: "cloudflare-wfp-tenant",
              short: setupConfigs["cloudflare-wfp-tenant"].name,
            },
            {
              name: `${setupConfigs["aws-sst"].name}\n     ${setupConfigs["aws-sst"].description}`,
              value: "aws-sst",
              short: setupConfigs["aws-sst"].name,
            },
            {
              name: `${setupConfigs.proxy.name}\n     ${setupConfigs.proxy.description}`,
              value: "proxy",
              short: setupConfigs.proxy.name,
            },
          ],
        },
      ]);
      setupType = answer.setupType;
    }

    // Multi-tenant mode. Not prompted for templates that decide tenancy
    // themselves: proxy/dispatcher don't run authhero; the control-plane
    // template is always multi-tenant; the wfp-tenant template serves a single
    // tenant and inherits defaults via runtime fallback.
    let multiTenant: boolean;
    if (setupType === "cloudflare-control-plane") {
      multiTenant = true;
    } else if (
      setupType === "proxy" ||
      setupType === "cloudflare-wfp-dispatcher" ||
      setupType === "cloudflare-wfp-tenant"
    ) {
      multiTenant = false;
    } else if (options.multiTenant !== undefined) {
      multiTenant = options.multiTenant;
    } else if (isNonInteractive) {
      multiTenant = false;
    } else {
      const answer = await inquirer.prompt([
        {
          type: "confirm",
          name: "multiTenant",
          message: "Would you like to enable multi-tenant mode?",
          default: false,
        },
      ]);
      multiTenant = answer.multiTenant;
    }
    if (multiTenant) {
      console.log("Multi-tenant mode: enabled");
    }

    // Handle admin UI option (local + cloudflare — AWS uses hosted admin)
    let adminUi = false;
    if (setupType === "local" || setupType === "cloudflare") {
      if (options.adminUi !== undefined) {
        adminUi = options.adminUi;
      } else if (isNonInteractive) {
        adminUi = true;
      } else {
        const answer = await inquirer.prompt([
          {
            type: "confirm",
            name: "adminUi",
            message: "Would you like to include the admin UI at /admin?",
            default: true,
          },
        ]);
        adminUi = answer.adminUi;
      }
      if (adminUi) {
        console.log("Admin UI: enabled (available at /admin)");
      }
    }

    // Handle conformance testing setup
    const conformance = options.conformance || false;
    const conformanceAlias = options.conformanceAlias || "authhero-local";
    if (conformance) {
      console.log(
        `OpenID Conformance Suite: enabled (alias: ${conformanceAlias})`,
      );
    }

    // Handle workspace mode
    const workspace = options.workspace || false;
    if (workspace) {
      console.log("Workspace mode: enabled (using workspace:* dependencies)");
    }

    const config = setupConfigs[setupType];

    // Create project directory
    fs.mkdirSync(projectPath, { recursive: true });

    // Write package.json with multi-tenant option
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify(
        config.packageJson(
          projectName,
          multiTenant,
          conformance,
          workspace,
          adminUi,
        ),
        null,
        2,
      ),
    );

    // Copy template files. Templates live next to the entry when bundled
    // (dist/<type>/) and under templates/ when running from source via tsx.
    const templateDir = config.templateDir;
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      path.join(scriptDir, templateDir),
      path.join(scriptDir, "..", "templates", templateDir),
    ];
    const sourceDir = candidatePaths.find((p) => fs.existsSync(p));

    if (sourceDir) {
      copyFiles(sourceDir, projectPath);
    } else {
      console.error(
        `❌ Template directory not found. Looked in:\n  ${candidatePaths.join("\n  ")}`,
      );
      process.exit(1);
    }

    // For Cloudflare setups, generate app.ts and seed.ts based on multi-tenant flag
    if (setupType === "cloudflare") {
      generateCloudflareFiles(projectPath, multiTenant, adminUi);
    }

    // For Cloudflare setups, create local config files
    const cloudflareLike =
      setupType === "cloudflare" ||
      setupType === "cloudflare-wfp-dispatcher" ||
      setupType === "cloudflare-wfp-tenant" ||
      setupType === "cloudflare-control-plane";
    // Templates that store/encrypt data themselves get a .dev.vars with keys.
    // The dispatcher doesn't, so it only gets wrangler.local.toml.
    const encryptsAtRest =
      setupType === "cloudflare" ||
      setupType === "cloudflare-wfp-tenant" ||
      setupType === "cloudflare-control-plane";
    // The WFP tenant + control plane templates additionally use a shared
    // control-plane key id ("cp") for inherited secrets.
    const usesControlPlaneKey =
      setupType === "cloudflare-wfp-tenant" ||
      setupType === "cloudflare-control-plane";

    if (cloudflareLike) {
      // Copy wrangler.toml to wrangler.local.toml for local development.
      // Skip if a wrangler.local.toml is already present so re-runs of the
      // scaffolder over an existing directory don't overwrite local edits.
      const wranglerPath = path.join(projectPath, "wrangler.toml");
      const wranglerLocalPath = path.join(projectPath, "wrangler.local.toml");
      if (fs.existsSync(wranglerPath) && !fs.existsSync(wranglerLocalPath)) {
        fs.copyFileSync(wranglerPath, wranglerLocalPath);
      }

      if (encryptsAtRest) {
        const devVarsExamplePath = path.join(projectPath, ".dev.vars.example");
        const devVarsPath = path.join(projectPath, ".dev.vars");
        if (fs.existsSync(devVarsExamplePath)) {
          fs.copyFileSync(devVarsExamplePath, devVarsPath);
          fs.appendFileSync(
            devVarsPath,
            `\n# Generated at-rest encryption key (local dev). Use a separate secret in production.\nENCRYPTION_KEY=${generateEncryptionKey()}\n`,
          );
          if (usesControlPlaneKey) {
            // Same generated value across the pair would be ideal, but each
            // project is scaffolded independently — operators must align the
            // control plane's and tenants' CONTROL_PLANE_ENCRYPTION_KEY.
            fs.appendFileSync(
              devVarsPath,
              `# Shared control-plane key id "cp". Must be byte-identical across the control plane and every tenant worker.\nCONTROL_PLANE_ENCRYPTION_KEY=${generateEncryptionKey()}\n`,
            );
            console.log(
              "🔒 Added generated ENCRYPTION_KEY + CONTROL_PLANE_ENCRYPTION_KEY to .dev.vars",
            );
            console.log(
              "⚠️  Align CONTROL_PLANE_ENCRYPTION_KEY across the control plane and all tenant workers.",
            );
          } else {
            console.log("🔒 Added a generated ENCRYPTION_KEY to .dev.vars");
          }
        }
        console.log(
          "📁 Created wrangler.local.toml and .dev.vars for local development",
        );
      } else {
        console.log("📁 Created wrangler.local.toml for local development");
      }
    }

    // Ask about GitHub CI for cloudflare setups
    let includeGithubCi = false;
    if (setupType === "cloudflare") {
      if (options.githubCi !== undefined) {
        includeGithubCi = options.githubCi;
        if (includeGithubCi) {
          console.log("Including GitHub CI workflows with semantic versioning");
        }
      } else if (!isNonInteractive) {
        const ciAnswer = await inquirer.prompt([
          {
            type: "confirm",
            name: "includeGithubCi",
            message:
              "Would you like to include GitHub CI with semantic versioning?",
            default: false,
          },
        ]);
        includeGithubCi = ciAnswer.includeGithubCi;
      }

      if (includeGithubCi) {
        createGithubWorkflows(projectPath);
        addSemanticReleaseConfig(projectPath);
      }
    }

    // Generate seed.ts and app.ts for local setup
    // cloudflare setup generates app.ts and seed.ts via generateCloudflareFiles
    if (setupType === "local") {
      const seedContent = generateLocalSeedFileContent(
        multiTenant,
        conformance,
        conformanceAlias,
        adminUi,
      );
      fs.writeFileSync(path.join(projectPath, "src/seed.ts"), seedContent);

      const appContent = generateLocalAppFileContent(multiTenant, adminUi);
      fs.writeFileSync(path.join(projectPath, "src/app.ts"), appContent);

      // Generate .env with a random encryption key so sensitive credential
      // fields are encrypted at rest out of the box. Keep this key stable —
      // rotating or losing it makes existing encrypted values unrecoverable.
      const envContent = `# Encryption key for at-rest encryption of sensitive credentials.
# Generated automatically. Keep this stable and secret — losing it makes
# existing encrypted data unrecoverable. Use a separate key in production.
ENCRYPTION_KEY=${generateEncryptionKey()}
`;
      fs.writeFileSync(path.join(projectPath, ".env"), envContent);
      console.log("🔒 Generated .env with an at-rest encryption key");
    }

    // Generate seed.ts and app.ts for AWS SST setup
    if (setupType === "aws-sst") {
      generateAwsSstFiles(projectPath, multiTenant);
    }

    // Generate conformance-config.json if conformance mode is enabled
    if (conformance) {
      const conformanceConfig = {
        alias: conformanceAlias,
        description: "AuthHero Conformance Test",
        server: {
          discoveryUrl:
            "http://host.docker.internal:3000/.well-known/openid-configuration",
        },
        client: {
          client_id: "conformance-test",
          client_secret: "conformanceTestSecret123",
        },
        client2: {
          client_id: "conformance-test2",
          client_secret: "conformanceTestSecret456",
        },
        resource: {
          resourceUrl: "http://host.docker.internal:3000/userinfo",
        },
      };
      fs.writeFileSync(
        path.join(projectPath, "conformance-config.json"),
        JSON.stringify(conformanceConfig, null, 2),
      );
      console.log(
        "📝 Created conformance-config.json for OpenID Conformance Suite",
      );
    }

    const tenantType = multiTenant ? "multi-tenant" : "single-tenant";
    console.log(
      `\n✅ Project "${projectName}" has been created with ${config.name} (${tenantType}) setup!\n`,
    );

    // Determine if we should install
    let shouldInstall: boolean;
    if (options.skipInstall) {
      shouldInstall = false;
    } else if (isNonInteractive) {
      shouldInstall = true;
    } else {
      const answer = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldInstall",
          message: "Would you like to install dependencies now?",
          default: true,
        },
      ]);
      shouldInstall = answer.shouldInstall;
    }

    if (shouldInstall) {
      // Determine package manager
      let packageManager: PackageManager;
      if (options.packageManager) {
        if (!["npm", "yarn", "pnpm", "bun"].includes(options.packageManager)) {
          console.error(
            `❌ Invalid package manager: ${options.packageManager}`,
          );
          console.error("Valid options: npm, yarn, pnpm, bun");
          process.exit(1);
        }
        packageManager = options.packageManager;
      } else if (isNonInteractive) {
        packageManager = "pnpm";
      } else {
        const answer = await inquirer.prompt([
          {
            type: "list",
            name: "packageManager",
            message: "Which package manager would you like to use?",
            choices: [
              { name: "pnpm", value: "pnpm" },
              { name: "npm", value: "npm" },
              { name: "yarn", value: "yarn" },
              { name: "bun", value: "bun" },
            ],
            default: "pnpm",
          },
        ]);
        packageManager = answer.packageManager;
      }

      console.log(`\n📦 Installing dependencies with ${packageManager}...\n`);

      try {
        // Use --ignore-workspace for pnpm to avoid hoisting to parent workspace
        const installCmd =
          packageManager === "pnpm"
            ? "pnpm install --ignore-workspace"
            : `${packageManager} install`;
        await runCommand(installCmd, projectPath);

        // For local setup, rebuild native modules (better-sqlite3)
        // Always use npm rebuild as it's the most reliable for native modules
        if (setupType === "local") {
          console.log("\n🔧 Building native modules...\n");
          await runCommand("npm rebuild better-sqlite3", projectPath);
        }

        console.log("\n✅ Dependencies installed successfully!\n");

        // Run migrations for setups that own a database. The wfp dispatcher
        // shares the control plane's D1, so it doesn't initialize the schema
        // itself.
        if (
          setupType === "local" ||
          setupType === "cloudflare" ||
          setupType === "cloudflare-wfp-tenant" ||
          setupType === "cloudflare-control-plane"
        ) {
          if (!options.skipMigrate) {
            let shouldMigrate: boolean;
            if (isNonInteractive) {
              shouldMigrate = true;
            } else {
              const answer = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "shouldMigrate",
                  message: "Would you like to run database migrations?",
                  default: true,
                },
              ]);
              shouldMigrate = answer.shouldMigrate;
            }

            if (shouldMigrate) {
              console.log("\n🔄 Running migrations...\n");
              await runCommand(`${packageManager} run migrate`, projectPath);
            }
          }
        }

        // Determine if we should start the dev server
        let shouldStart: boolean;
        if (options.skipStart) {
          shouldStart = false;
        } else if (isNonInteractive) {
          shouldStart = false; // Don't auto-start in non-interactive mode
        } else {
          const answer = await inquirer.prompt([
            {
              type: "confirm",
              name: "shouldStart",
              message: "Would you like to start the development server?",
              default: true,
            },
          ]);
          shouldStart = answer.shouldStart;
        }

        if (shouldStart) {
          // Print nice success message before starting
          if (setupType === "cloudflare") {
            printCloudflareSuccessMessage();
          } else if (setupType === "cloudflare-wfp-dispatcher") {
            printCloudflareWfpDispatcherSuccessMessage();
          } else if (setupType === "cloudflare-wfp-tenant") {
            printCloudflareWfpTenantSuccessMessage();
          } else if (setupType === "cloudflare-control-plane") {
            printCloudflareControlPlaneSuccessMessage();
          } else if (setupType === "aws-sst") {
            printAwsSstSuccessMessage();
          } else if (setupType === "proxy") {
            printProxySuccessMessage();
          } else {
            printLocalSuccessMessage(adminUi);
          }
          console.log("🚀 Starting development server...\n");
          await runCommand(`${packageManager} run dev`, projectPath);
        }

        // Success message for non-interactive mode
        if (isNonInteractive && !shouldStart) {
          console.log("\n✅ Setup complete!");
          console.log(`\nTo start the development server:`);
          console.log(`  cd ${projectName}`);
          console.log(`  npm run dev`);
          if (setupType === "cloudflare") {
            printCloudflareSuccessMessage();
          } else if (setupType === "cloudflare-wfp-dispatcher") {
            printCloudflareWfpDispatcherSuccessMessage();
          } else if (setupType === "cloudflare-wfp-tenant") {
            printCloudflareWfpTenantSuccessMessage();
          } else if (setupType === "cloudflare-control-plane") {
            printCloudflareControlPlaneSuccessMessage();
          } else if (setupType === "aws-sst") {
            printAwsSstSuccessMessage();
          } else if (setupType === "proxy") {
            printProxySuccessMessage();
          } else {
            printLocalSuccessMessage(adminUi);
          }
        }
      } catch (error) {
        console.error("\n❌ An error occurred:", error);
        process.exit(1);
      }
    }

    if (!shouldInstall) {
      console.log("Next steps:");
      console.log(`  cd ${projectName}`);

      if (setupType === "local") {
        console.log("  npm install");
        console.log("  npm run migrate");
        console.log("  npm run dev");
        console.log(
          "\nOpen https://localhost:3000/setup to complete initial setup",
        );
      } else if (setupType === "cloudflare") {
        console.log("  npm install");
        console.log(
          "  npm run migrate  # or npm run db:migrate:remote for production",
        );
        console.log("  npm run dev  # or npm run dev:remote for production");
        console.log(
          "\nOpen https://localhost:3000/setup to complete initial setup",
        );
      } else if (setupType === "cloudflare-wfp-dispatcher") {
        console.log("  npm install");
        console.log(
          "  npm run setup  # creates wrangler.local.toml — paste your database_id",
        );
        console.log(
          "  npx wrangler dispatch-namespace create authhero-tenants",
        );
        console.log("  npm run dev  # or npm run dev:remote for production");
        console.log(
          "\nDeploy tenant workers separately (`cloudflare` template):",
        );
        console.log(
          "  wrangler deploy --dispatch-namespace=authhero-tenants --name=tenant-<id>-auth",
        );
      } else if (setupType === "cloudflare-control-plane") {
        console.log("  npm install");
        console.log(
          "  npm run setup  # creates wrangler.local.toml + .dev.vars",
        );
        console.log(
          "  # set CONTROL_PLANE_ENCRYPTION_KEY in .dev.vars (share it with every tenant worker)",
        );
        console.log("  npm run migrate");
        console.log("  npm run seed");
        console.log("  npm run dev  # or npm run dev:remote for production");
        console.log(
          "\nWire buildTenantAdapters() in src/index.ts, then project defaults:",
        );
        console.log("  POST /internal/tenants/:id/sync-defaults");
      } else if (setupType === "cloudflare-wfp-tenant") {
        console.log("  npm install");
        console.log(
          "  npm run setup  # creates wrangler.local.toml + .dev.vars",
        );
        console.log(
          "  # set CONTROL_PLANE_ENCRYPTION_KEY in .dev.vars (must match the control plane)",
        );
        console.log("  npm run migrate");
        console.log("  npm run dev  # or npm run dev:remote for production");
        console.log("\nDeploy into the dispatch namespace:");
        console.log(
          "  wrangler deploy --dispatch-namespace=authhero-tenants --name=tenant-<id>-auth",
        );
      } else if (setupType === "aws-sst") {
        console.log("  npm install");
        console.log("  npm run dev  # Deploys to AWS in development mode");
        console.log("\nOpen your server URL /setup to complete initial setup");
      } else if (setupType === "proxy") {
        console.log("  npm install");
        console.log("  npm run dev");
        console.log("\nEdit src/proxy.config.ts to add hosts and routes");
      }

      const port =
        setupType === "proxy"
          ? 8787
          : setupType === "cloudflare-wfp-dispatcher"
            ? 3001
            : setupType === "cloudflare-wfp-tenant"
              ? 3002
              : 3000;
      // The proxy template serves plain http; all other templates run their
      // dev server with TLS (self-signed certs / wrangler --local-protocol).
      const protocol = setupType === "proxy" ? "http" : "https";
      console.log(
        `\nServer will be available at: ${protocol}://localhost:${port}`,
      );

      if (conformance) {
        console.log("\n🧪 OpenID Conformance Suite Testing:");
        console.log(
          "  1. Clone and start the conformance suite (if not already running):",
        );
        console.log(
          "     git clone https://gitlab.com/openid/conformance-suite.git",
        );
        console.log("     cd conformance-suite && mvn clean package");
        console.log("     docker-compose up -d");
        console.log("  2. Open https://localhost.emobix.co.uk:8443");
        console.log(
          "  3. Create a test plan and use conformance-config.json for settings",
        );
        console.log(`  4. Use alias: ${conformanceAlias}`);
      }

      console.log("\nFor more information, visit: https://docs.authhero.net\n");
    }
  });

program.parse(process.argv);
