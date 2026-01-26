#!/usr/bin/env node

import { Command } from "commander";
import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const program = new Command();

type SetupType = "local" | "cloudflare" | "aws-sst";
type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

interface CliOptions {
  template?: SetupType;
  email?: string;
  password?: string;
  packageManager?: PackageManager;
  skipInstall?: boolean;
  skipMigrate?: boolean;
  skipSeed?: boolean;
  skipStart?: boolean;
  yes?: boolean;
  githubCi?: boolean;
  multiTenant?: boolean;
  conformance?: boolean;
  conformanceAlias?: string;
}

interface SetupConfig {
  name: string;
  description: string;
  templateDir: string;
  packageJson: (projectName: string, multiTenant: boolean, conformance?: boolean) => object;
  seedFile?: string;
}

interface AdminCredentials {
  username: string;
  password: string;
}

const setupConfigs: Record<SetupType, SetupConfig> = {
  local: {
    name: "Local (SQLite)",
    description:
      "Local development setup with SQLite database - great for getting started",
    templateDir: "local",
    packageJson: (projectName, multiTenant, conformance) => ({
      name: projectName,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "npx tsx watch src/index.ts",
        start: "npx tsx src/index.ts",
        migrate: "npx tsx src/migrate.ts",
        seed: "npx tsx src/seed.ts",
      },
      dependencies: {
        "@authhero/kysely-adapter": "latest",
        "@authhero/widget": "latest",
        "@hono/swagger-ui": "^0.5.0",
        "@hono/zod-openapi": "^0.19.0",
        "@hono/node-server": "latest",
        authhero: "latest",
        "better-sqlite3": "latest",
        hono: "^4.6.0",
        kysely: "latest",
        ...(multiTenant && { "@authhero/multi-tenancy": "latest" }),
        ...(conformance && { bcryptjs: "latest" }),
      },
      devDependencies: {
        "@types/better-sqlite3": "^7.6.0",
        "@types/node": "^20.0.0",
        tsx: "^4.0.0",
        typescript: "^5.5.0",
      },
    }),
    seedFile: "seed.ts",
  },
  cloudflare: {
    name: "Cloudflare Workers (D1)",
    description: "Cloudflare Workers setup with D1 database",
    templateDir: "cloudflare",
    packageJson: (projectName, multiTenant, conformance) => ({
      name: projectName,
      version: "1.0.0",
      type: "module",
      scripts: {
        postinstall: "node copy-assets.js",
        "copy-assets": "node copy-assets.js",
        dev: "wrangler dev --port 3000 --local-protocol https",
        "dev:remote":
          "wrangler dev --port 3000 --local-protocol https --remote --config wrangler.local.toml",
        deploy: "wrangler deploy --config wrangler.local.toml",
        "db:migrate:local": "wrangler d1 migrations apply AUTH_DB --local",
        "db:migrate:remote":
          "wrangler d1 migrations apply AUTH_DB --remote --config wrangler.local.toml",
        migrate: "wrangler d1 migrations apply AUTH_DB --local",
        "seed:local": "node seed-helper.js",
        "seed:remote": "node seed-helper.js '' '' remote",
        seed: "node seed-helper.js",
        setup:
          "cp wrangler.toml wrangler.local.toml && cp .dev.vars.example .dev.vars && echo '✅ Created wrangler.local.toml and .dev.vars - update with your IDs'",
      },
      dependencies: {
        "@authhero/drizzle": "latest",
        "@authhero/kysely-adapter": "latest",
        "@authhero/widget": "latest",
        "@hono/swagger-ui": "^0.5.0",
        "@hono/zod-openapi": "^0.19.0",
        authhero: "latest",
        hono: "^4.6.0",
        kysely: "latest",
        "kysely-d1": "latest",
        ...(multiTenant && { "@authhero/multi-tenancy": "latest" }),
        ...(conformance && { bcryptjs: "latest" }),
      },
      devDependencies: {
        "@cloudflare/workers-types": "^4.0.0",
        "drizzle-kit": "^0.31.0",
        "drizzle-orm": "^0.44.0",
        typescript: "^5.5.0",
        wrangler: "^3.0.0",
      },
    }),
    seedFile: "seed.ts",
  },
  "aws-sst": {
    name: "AWS SST (Lambda + DynamoDB)",
    description: "Serverless AWS deployment with Lambda, DynamoDB, and SST",
    templateDir: "aws-sst",
    packageJson: (projectName, multiTenant, conformance) => ({
      name: projectName,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "sst dev",
        deploy: "sst deploy --stage production",
        remove: "sst remove",
        seed: "npx tsx src/seed.ts",
        "copy-assets": "node copy-assets.js",
      },
      dependencies: {
        "@authhero/aws": "latest",
        "@authhero/widget": "latest",
        "@aws-sdk/client-dynamodb": "^3.0.0",
        "@aws-sdk/lib-dynamodb": "^3.0.0",
        "@hono/swagger-ui": "^0.5.0",
        "@hono/zod-openapi": "^0.19.0",
        authhero: "latest",
        hono: "^4.6.0",
        ...(multiTenant && { "@authhero/multi-tenancy": "latest" }),
        ...(conformance && { bcryptjs: "latest" }),
      },
      devDependencies: {
        "@types/aws-lambda": "^8.10.0",
        "@types/node": "^20.0.0",
        sst: "^3.0.0",
        tsx: "^4.0.0",
        typescript: "^5.5.0",
      },
    }),
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
  multiTenant: boolean,
  conformance: boolean = false,
  conformanceAlias: string = "authhero-local",
): string {
  const tenantId = multiTenant ? "control_plane" : "main";
  const tenantName = multiTenant ? "Control Plane" : "Main";

  // Build callbacks array
  const defaultCallbacks = [
    "https://manage.authhero.net/auth-callback",
    "https://local.authhero.net/auth-callback",
    "http://localhost:5173/auth-callback",
    "https://localhost:3000/auth-callback",
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

  try {
    await adapters.clients.create("${tenantId}", {
      client_id: "conformance-test",
      client_secret: "conformanceTestSecret123",
      name: "Conformance Test Client",
      callbacks: conformanceCallbacks,
      allowed_logout_urls: conformanceLogoutUrls,
      web_origins: conformanceWebOrigins,
    });
    console.log("✅ Created conformance-test client");
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint")) {
      console.log("ℹ️  conformance-test client already exists");
    } else {
      throw e;
    }
  }

  try {
    await adapters.clients.create("${tenantId}", {
      client_id: "conformance-test2",
      client_secret: "conformanceTestSecret456",
      name: "Conformance Test Client 2",
      callbacks: conformanceCallbacks,
      allowed_logout_urls: conformanceLogoutUrls,
      web_origins: conformanceWebOrigins,
    });
    console.log("✅ Created conformance-test2 client");
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint")) {
      console.log("ℹ️  conformance-test2 client already exists");
    } else {
      throw e;
    }
  }

  // Create a conformance test user with ALL OIDC profile claims populated
  // This is required for OIDCC-5.4 (VerifyScopesReturnedInUserInfoClaims) test
  try {
    await adapters.users.create("${tenantId}", {
      user_id: "auth2|conformance-user",
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
      provider: "auth2",
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
      user_id: "auth2|conformance-user",
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
  return `import { SqliteDialect, Kysely } from "kysely";
import Database from "better-sqlite3";
import createAdapters from "@authhero/kysely-adapter";
import { seed } from "authhero";

async function main() {
  const adminEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  const adminPassword = process.argv[3] || process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error("Usage: npm run seed <email> <password>");
    console.error("   or: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed");
    process.exit(1);
  }

  const dialect = new SqliteDialect({
    database: new Database("db.sqlite"),
  });

  const db = new Kysely<any>({ dialect });
  const adapters = createAdapters(db);

  await seed(adapters, {
    adminEmail,
    adminPassword,
    tenantId: "${tenantId}",
    tenantName: "${tenantName}",
    isControlPlane: ${multiTenant},
    callbacks: ${JSON.stringify(callbacks)},
    allowedLogoutUrls: ${JSON.stringify(allowedLogoutUrls)},
  });
${conformanceClientCode}
  await db.destroy();
}

main().catch(console.error);
`;
}

function generateLocalAppFileContent(multiTenant: boolean): string {
  if (multiTenant) {
    return `import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { AuthHeroConfig, DataAdapters } from "authhero";
import { serveStatic } from "@hono/node-server/serve-static";
import { initMultiTenant } from "@authhero/multi-tenancy";

// Control plane configuration
const CONTROL_PLANE_TENANT_ID = "control_plane";
const CONTROL_PLANE_CLIENT_ID = "default_client";

export default function createApp(config: AuthHeroConfig & { dataAdapter: DataAdapters }) {
  // Initialize multi-tenant AuthHero - syncs resource servers, roles, and connections by default
  const { app } = initMultiTenant({
    ...config,
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
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }))
    // Serve widget assets from @authhero/widget package
    .get(
      "/u/widget/*",
      serveStatic({
        root: "./node_modules/@authhero/widget/dist/authhero-widget",
        rewriteRequestPath: (path) => path.replace("/u/widget", ""),
      }),
    )
    // Serve static assets (CSS, JS) from authhero package
    .get(
      "/u/*",
      serveStatic({
        root: "./node_modules/authhero/dist/assets/u",
        rewriteRequestPath: (path) => path.replace("/u", ""),
      }),
    );

  return app;
}
`;
  }

  return `import { Context } from "hono";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "@hono/node-server/serve-static";

export default function createApp(config: AuthHeroConfig) {
  const { app } = init(config);

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
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }))
    // Serve widget assets from @authhero/widget package
    .get(
      "/u/widget/*",
      serveStatic({
        root: "./node_modules/@authhero/widget/dist/authhero-widget",
        rewriteRequestPath: (path) => path.replace("/u/widget", ""),
      }),
    )
    // Serve static assets (CSS, JS) from authhero package
    .get(
      "/u/*",
      serveStatic({
        root: "./node_modules/authhero/dist/assets/u",
        rewriteRequestPath: (path) => path.replace("/u", ""),
      }),
    );

  return app;
}
`;
}

function generateCloudflareSeedFileContent(multiTenant: boolean): string {
  const tenantId = multiTenant ? "control_plane" : "main";
  const tenantName = multiTenant ? "Control Plane" : "Main";

  return `import { D1Dialect } from "kysely-d1";
import { Kysely } from "kysely";
import createAdapters from "@authhero/kysely-adapter";
import { seed } from "authhero";

interface Env {
  AUTH_DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const adminEmail = url.searchParams.get("email");
    const adminPassword = url.searchParams.get("password");
    // Compute issuer from the request URL (for Management API identifier)
    const issuer = \`\${url.protocol}//\${url.host}/\`;

    if (!adminEmail || !adminPassword) {
      return new Response(
        JSON.stringify({
          error: "Missing email or password query parameters",
          usage: "/?email=admin@example.com&password=yourpassword",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const dialect = new D1Dialect({ database: env.AUTH_DB });
      const db = new Kysely<any>({ dialect });
      const adapters = createAdapters(db);

      const result = await seed(adapters, {
        adminEmail,
        adminPassword,
        issuer,
        tenantId: "${tenantId}",
        tenantName: "${tenantName}",
        isControlPlane: ${multiTenant},
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

function generateCloudflareAppFileContent(multiTenant: boolean): string {
  if (multiTenant) {
    return `import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { AuthHeroConfig, DataAdapters } from "authhero";
import { initMultiTenant } from "@authhero/multi-tenancy";

// Control plane configuration
const CONTROL_PLANE_TENANT_ID = "control_plane";
const CONTROL_PLANE_CLIENT_ID = "default_client";

export default function createApp(config: AuthHeroConfig & { dataAdapter: DataAdapters }) {
  // Initialize multi-tenant AuthHero - syncs resource servers, roles, and connections by default
  const { app } = initMultiTenant({
    ...config,
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
import { cors } from "hono/cors";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";

export default function createApp(config: AuthHeroConfig) {
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

function generateAwsSstAppFileContent(multiTenant: boolean): string {
  if (multiTenant) {
    return `import { Context } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { AuthHeroConfig, DataAdapters } from "authhero";
import { initMultiTenant } from "@authhero/multi-tenancy";

// Control plane configuration
const CONTROL_PLANE_TENANT_ID = "control_plane";
const CONTROL_PLANE_CLIENT_ID = "default_client";

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

function generateAwsSstSeedFileContent(multiTenant: boolean): string {
  const tenantId = multiTenant ? "control_plane" : "main";
  const tenantName = multiTenant ? "Control Plane" : "Main";

  return `import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import createAdapters from "@authhero/aws";
import { seed } from "authhero";

async function main() {
  const adminEmail = process.argv[2] || process.env.ADMIN_EMAIL;
  const adminPassword = process.argv[3] || process.env.ADMIN_PASSWORD;
  const tableName = process.argv[4] || process.env.TABLE_NAME;

  if (!adminEmail || !adminPassword) {
    console.error("Usage: npm run seed <email> <password>");
    console.error("   or: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed");
    process.exit(1);
  }

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

  const adapters = createAdapters(docClient, { tableName });

  await seed(adapters, {
    adminEmail,
    adminPassword,
    tenantId: "${tenantId}",
    tenantName: "${tenantName}",
    isControlPlane: ${multiTenant},
  });

  console.log("✅ Database seeded successfully!");
}

main().catch(console.error);
`;
}

function generateAwsSstFiles(projectPath: string, multiTenant: boolean): void {
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
}

function printAwsSstSuccessMessage(multiTenant: boolean): void {
  console.log("\\n" + "─".repeat(50));
  console.log("🔐 AuthHero deployed to AWS!");
  console.log("📚 Check SST output for your API URL");
  console.log("🌐 Portal available at https://local.authhero.net");
  if (multiTenant) {
    console.log("🏢 Multi-tenant mode enabled with control_plane tenant");
  } else {
    console.log("🏠 Single-tenant mode with 'main' tenant");
  }
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

function runCommandWithEnv(
  command: string,
  cwd: string,
  env: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd,
      shell: true,
      stdio: "inherit",
      env: { ...process.env, ...env },
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
  multiTenant: boolean,
): void {
  const srcDir = path.join(projectPath, "src");

  // Generate app.ts
  fs.writeFileSync(
    path.join(srcDir, "app.ts"),
    generateCloudflareAppFileContent(multiTenant),
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
function printCloudflareSuccessMessage(multiTenant: boolean): void {
  console.log("\n" + "─".repeat(50));
  console.log("🔐 AuthHero server running at https://localhost:3000");
  console.log("📚 API documentation available at https://localhost:3000/docs");
  console.log("🌐 Portal available at https://local.authhero.net");
  if (multiTenant) {
    console.log("🏢 Multi-tenant mode enabled with control_plane tenant");
  } else {
    console.log("🏠 Single-tenant mode with 'main' tenant");
  }
  console.log("─".repeat(50) + "\n");
}

/**
 * Prints nice output at the end of setup for local/sqlite
 */
function printLocalSuccessMessage(multiTenant: boolean): void {
  console.log("\n" + "─".repeat(50));
  console.log("✅ Self-signed certificates generated with openssl");
  console.log("⚠️  You may need to trust the certificate in your browser");
  console.log("🔐 AuthHero server running at https://localhost:3000");
  console.log("📚 API documentation available at https://localhost:3000/docs");
  console.log("🌐 Portal available at https://local.authhero.net");
  if (multiTenant) {
    console.log("🏢 Multi-tenant mode enabled with control_plane tenant");
  } else {
    console.log("🏠 Single-tenant mode with 'main' tenant");
  }
  console.log("─".repeat(50) + "\n");
}

program
  .version("1.0.0")
  .description("Create a new AuthHero project")
  .argument("[project-name]", "name of the project")
  .option("-t, --template <type>", "template type: local or cloudflare")
  .option("-e, --email <email>", "admin email address")
  .option("-p, --password <password>", "admin password (min 8 characters)")
  .option(
    "--package-manager <pm>",
    "package manager to use: npm, yarn, pnpm, or bun",
  )
  .option("--multi-tenant", "enable multi-tenant mode")
  .option("--skip-install", "skip installing dependencies")
  .option("--skip-migrate", "skip running database migrations")
  .option("--skip-seed", "skip seeding the database")
  .option("--skip-start", "skip starting the development server")
  .option("--github-ci", "include GitHub CI workflows with semantic versioning")
  .option("--conformance", "add OpenID conformance suite test clients")
  .option(
    "--conformance-alias <alias>",
    "alias for conformance suite (default: authhero-local)",
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
      if (!["local", "cloudflare", "aws-sst"].includes(options.template)) {
        console.error(`❌ Invalid template: ${options.template}`);
        console.error("Valid options: local, cloudflare, aws-sst");
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
              name: `${setupConfigs["aws-sst"].name}\n     ${setupConfigs["aws-sst"].description}`,
              value: "aws-sst",
              short: setupConfigs["aws-sst"].name,
            },
          ],
        },
      ]);
      setupType = answer.setupType;
    }

    // Ask about multi-tenant setup
    let multiTenant: boolean;
    if (options.multiTenant !== undefined) {
      multiTenant = options.multiTenant;
      console.log(`Multi-tenant mode: ${multiTenant ? "enabled" : "disabled"}`);
    } else if (isNonInteractive) {
      multiTenant = false; // Default to single tenant
    } else {
      const multiTenantAnswer = await inquirer.prompt([
        {
          type: "confirm",
          name: "multiTenant",
          message:
            "Would you like to enable multi-tenant mode?\n     (Allows managing multiple tenants from a control plane)",
          default: false,
        },
      ]);
      multiTenant = multiTenantAnswer.multiTenant;
    }

    // Handle conformance testing setup
    const conformance = options.conformance || false;
    const conformanceAlias = options.conformanceAlias || "authhero-local";
    if (conformance) {
      console.log(
        `OpenID Conformance Suite: enabled (alias: ${conformanceAlias})`,
      );
    }

    const config = setupConfigs[setupType];

    // Create project directory
    fs.mkdirSync(projectPath, { recursive: true });

    // Write package.json with multi-tenant option
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify(config.packageJson(projectName, multiTenant, conformance), null, 2),
    );

    // Copy template files
    const templateDir = config.templateDir;

    const sourceDir = path.join(
      import.meta.url.replace("file://", "").replace("/create-authhero.js", ""),
      templateDir,
    );

    if (fs.existsSync(sourceDir)) {
      copyFiles(sourceDir, projectPath);
    } else {
      console.error(`❌ Template directory not found: ${sourceDir}`);
      process.exit(1);
    }

    // For Cloudflare setups, generate app.ts and seed.ts based on multi-tenant flag
    if (setupType === "cloudflare") {
      generateCloudflareFiles(projectPath, multiTenant);
    }

    // For Cloudflare setups, create local config files
    if (setupType === "cloudflare") {
      // Copy wrangler.toml to wrangler.local.toml for local development
      const wranglerPath = path.join(projectPath, "wrangler.toml");
      const wranglerLocalPath = path.join(projectPath, "wrangler.local.toml");
      if (fs.existsSync(wranglerPath)) {
        fs.copyFileSync(wranglerPath, wranglerLocalPath);
      }

      // Copy .dev.vars.example to .dev.vars
      const devVarsExamplePath = path.join(projectPath, ".dev.vars.example");
      const devVarsPath = path.join(projectPath, ".dev.vars");
      if (fs.existsSync(devVarsExamplePath)) {
        fs.copyFileSync(devVarsExamplePath, devVarsPath);
      }

      console.log(
        "📁 Created wrangler.local.toml and .dev.vars for local development",
      );
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
      );
      fs.writeFileSync(path.join(projectPath, "src/seed.ts"), seedContent);

      const appContent = generateLocalAppFileContent(multiTenant);
      fs.writeFileSync(path.join(projectPath, "src/app.ts"), appContent);
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

        // For local and cloudflare setups, run migrations and seed
        if (setupType === "local" || setupType === "cloudflare") {
          // Determine if we should run migrations and seed
          let shouldSetup: boolean;
          if (options.skipMigrate && options.skipSeed) {
            shouldSetup = false;
          } else if (isNonInteractive) {
            shouldSetup = !options.skipMigrate || !options.skipSeed;
          } else {
            const answer = await inquirer.prompt([
              {
                type: "confirm",
                name: "shouldSetup",
                message:
                  "Would you like to run migrations and seed the database?",
                default: true,
              },
            ]);
            shouldSetup = answer.shouldSetup;
          }

          if (shouldSetup) {
            // Get admin credentials
            let credentials: AdminCredentials;
            if (options.email && options.password) {
              // Validate provided credentials
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(options.email)) {
                console.error("❌ Invalid email address provided");
                process.exit(1);
              }
              if (options.password.length < 8) {
                console.error("❌ Password must be at least 8 characters");
                process.exit(1);
              }
              credentials = {
                username: options.email,
                password: options.password,
              };
              console.log(`Using admin email: ${options.email}`);
            } else {
              credentials = await inquirer.prompt<AdminCredentials>([
                {
                  type: "input",
                  name: "username",
                  message: "Admin email:",
                  default: "admin@example.com",
                  validate: (input: string) => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return (
                      emailRegex.test(input) ||
                      "Please enter a valid email address"
                    );
                  },
                },
                {
                  type: "password",
                  name: "password",
                  message: "Admin password:",
                  mask: "*",
                  validate: (input: string) => {
                    if (input.length < 8) {
                      return "Password must be at least 8 characters";
                    }
                    return true;
                  },
                },
              ]);
            }

            // Run migrations unless skipped
            if (!options.skipMigrate) {
              console.log("\n🔄 Running migrations...\n");
              await runCommand(`${packageManager} run migrate`, projectPath);
            }

            // Seed unless skipped
            if (!options.skipSeed) {
              console.log("\n🌱 Seeding database...\n");
              if (setupType === "local") {
                // Pass credentials via environment variables to avoid shell injection
                await runCommandWithEnv(
                  `${packageManager} run seed`,
                  projectPath,
                  {
                    ADMIN_EMAIL: credentials.username,
                    ADMIN_PASSWORD: credentials.password,
                  },
                );
              } else {
                // For cloudflare setups, use the seed helper with environment variables
                await runCommandWithEnv(
                  `${packageManager} run seed:local`,
                  projectPath,
                  {
                    ADMIN_EMAIL: credentials.username,
                    ADMIN_PASSWORD: credentials.password,
                  },
                );
              }
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
            printCloudflareSuccessMessage(multiTenant);
          } else if (setupType === "aws-sst") {
            printAwsSstSuccessMessage(multiTenant);
          } else {
            printLocalSuccessMessage(multiTenant);
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
            printCloudflareSuccessMessage(multiTenant);
          } else if (setupType === "aws-sst") {
            printAwsSstSuccessMessage(multiTenant);
          } else {
            printLocalSuccessMessage(multiTenant);
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
        console.log(
          "  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed",
        );
        console.log("  npm run dev");
      } else if (setupType === "cloudflare") {
        console.log("  npm install");
        console.log(
          "  npm run migrate  # or npm run db:migrate:remote for production",
        );
        console.log(
          "  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed",
        );
        console.log("  npm run dev  # or npm run dev:remote for production");
      } else if (setupType === "aws-sst") {
        console.log("  npm install");
        console.log("  npm run dev  # Deploys to AWS in development mode");
        console.log("  # After deploy, get TABLE_NAME from output, then:");
        console.log(
          "  TABLE_NAME=<your-table> ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed",
        );
      }

      console.log("\nServer will be available at: https://localhost:3000");
      console.log("Portal available at: https://local.authhero.net");

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

      console.log("\nFor more information, visit: https://authhero.net/docs\n");
    }
  });

program.parse(process.argv);
