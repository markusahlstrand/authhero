#!/usr/bin/env node

import { Command } from "commander";
import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const program = new Command();

type SetupType = "local" | "cloudflare-simple" | "cloudflare-multitenant";

interface SetupConfig {
  name: string;
  description: string;
  templateDir: string;
  packageJson: (projectName: string) => object;
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
    packageJson: (projectName) => ({
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
        "@hono/swagger-ui": "^0.5.0",
        "@hono/zod-openapi": "^0.19.0",
        "@hono/node-server": "latest",
        authhero: "latest",
        "better-sqlite3": "latest",
        hono: "^4.6.0",
        kysely: "latest",
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
  "cloudflare-simple": {
    name: "Cloudflare Simple (Single Tenant)",
    description: "Single-tenant Cloudflare Workers setup with D1 database",
    templateDir: "cloudflare-simple",
    packageJson: (projectName) => ({
      name: projectName,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "wrangler dev",
        deploy: "wrangler deploy",
        "db:migrate": "wrangler d1 migrations apply AUTH_DB --local",
        "db:migrate:prod": "wrangler d1 migrations apply AUTH_DB --remote",
        seed: "wrangler d1 execute AUTH_DB --local --file=seed.sql",
      },
      dependencies: {
        "@authhero/kysely-adapter": "latest",
        "@hono/swagger-ui": "^0.5.0",
        "@hono/zod-openapi": "^0.19.0",
        authhero: "latest",
        hono: "^4.6.0",
        kysely: "latest",
        "kysely-d1": "latest",
      },
      devDependencies: {
        "@cloudflare/workers-types": "^4.0.0",
        typescript: "^5.5.0",
        wrangler: "^3.0.0",
      },
    }),
    seedFile: "seed.sql",
  },
  "cloudflare-multitenant": {
    name: "Cloudflare Multi-Tenant (Production)",
    description:
      "Production-grade multi-tenant setup with per-tenant D1 databases and Analytics Engine",
    templateDir: "cloudflare-multitenant",
    packageJson: (projectName) => ({
      name: projectName,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "wrangler dev",
        deploy: "wrangler deploy",
        "db:migrate": "wrangler d1 migrations apply MAIN_DB --local",
        "db:migrate:prod": "wrangler d1 migrations apply MAIN_DB --remote",
        seed: "wrangler d1 execute MAIN_DB --local --file=seed.sql",
      },
      dependencies: {
        "@authhero/cloudflare-adapter": "latest",
        "@authhero/kysely-adapter": "latest",
        "@authhero/multi-tenancy": "latest",
        "@hono/swagger-ui": "^0.5.0",
        "@hono/zod-openapi": "^0.19.10",
        authhero: "latest",
        hono: "^4.6.0",
        kysely: "latest",
        "kysely-d1": "latest",
        wretch: "^3.0.0",
      },
      devDependencies: {
        "@cloudflare/workers-types": "^4.0.0",
        typescript: "^5.5.0",
        wrangler: "^3.0.0",
      },
    }),
    seedFile: "seed.sql",
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

function generateSeedFileContent(setupType: SetupType): string {
  if (setupType === "local") {
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
  });

  await db.destroy();
}

main().catch(console.error);
`;
  } else {
    // SQL seed file for Cloudflare D1
    // Note: For Cloudflare, we'll need a different approach since we can't run TypeScript directly
    const now = new Date().toISOString();
    const tenantId = "default";

    return `-- Seed file for AuthHero
-- 
-- IMPORTANT: This SQL file creates the basic structure but the password
-- cannot be properly hashed in SQL. After running this seed, you should
-- use the management API or run a script to set the admin password.

-- Create default tenant
INSERT OR IGNORE INTO tenants (id, friendly_name, audience, sender_email, sender_name, created_at, updated_at)
VALUES ('${tenantId}', 'Default Tenant', 'https://api.example.com', 'noreply@example.com', 'AuthHero', '${now}', '${now}');

-- Create password connection
INSERT OR IGNORE INTO connections (id, tenant_id, name, strategy, options, created_at, updated_at)
VALUES ('conn_default', '${tenantId}', 'Username-Password-Authentication', 'Username-Password-Authentication', '{}', '${now}', '${now}');

-- Create default client
INSERT OR IGNORE INTO clients (client_id, tenant_id, name, callbacks, allowed_origins, web_origins, connections, created_at, updated_at)
VALUES ('default', '${tenantId}', 'Default Application', '["https://manage.authhero.net/auth-callback"]', '[]', '[]', '["Username-Password-Authentication"]', '${now}', '${now}');

-- Note: Admin user and password should be created via the management API
-- or using a TypeScript seed script with proper bcrypt hashing.
-- Example command: curl -X POST http://localhost:3000/api/v2/users ...
`;
  }
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

program
  .version("1.0.0")
  .description("Create a new AuthHero project")
  .argument("[project-name]", "name of the project")
  .action(async (projectName) => {
    console.log("\n🔐 Welcome to AuthHero!\n");

    if (!projectName) {
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

    const projectPath = path.join(process.cwd(), projectName);

    if (fs.existsSync(projectPath)) {
      console.error(`❌ Project "${projectName}" already exists.`);
      process.exit(1);
    }

    const { setupType } = await inquirer.prompt([
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
            name: `${setupConfigs["cloudflare-simple"].name}\n     ${setupConfigs["cloudflare-simple"].description}`,
            value: "cloudflare-simple",
            short: setupConfigs["cloudflare-simple"].name,
          },
          {
            name: `${setupConfigs["cloudflare-multitenant"].name}\n     ${setupConfigs["cloudflare-multitenant"].description}`,
            value: "cloudflare-multitenant",
            short: setupConfigs["cloudflare-multitenant"].name,
          },
        ],
      },
    ]);

    const config = setupConfigs[setupType as SetupType];

    // Create project directory
    fs.mkdirSync(projectPath, { recursive: true });

    // Write package.json
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify(config.packageJson(projectName), null, 2),
    );

    // Copy template files
    const sourceDir = path.join(
      import.meta.url.replace("file://", "").replace("/create-authhero.js", ""),
      config.templateDir,
    );

    if (fs.existsSync(sourceDir)) {
      copyFiles(sourceDir, projectPath);
    } else {
      console.error(`❌ Template directory not found: ${sourceDir}`);
      process.exit(1);
    }

    // Generate seed file
    const seedContent = generateSeedFileContent(setupType as SetupType);
    const seedFileName = setupType === "local" ? "src/seed.ts" : "seed.sql";
    fs.writeFileSync(path.join(projectPath, seedFileName), seedContent);

    console.log(
      `\n✅ Project "${projectName}" has been created with ${config.name} setup!\n`,
    );

    // Ask about installing packages and starting server
    const { shouldInstall } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldInstall",
        message: "Would you like to install dependencies now?",
        default: true,
      },
    ]);

    if (shouldInstall) {
      const { packageManager } = await inquirer.prompt([
        {
          type: "list",
          name: "packageManager",
          message: "Which package manager would you like to use?",
          choices: [
            { name: "npm", value: "npm" },
            { name: "yarn", value: "yarn" },
            { name: "pnpm", value: "pnpm" },
            { name: "bun", value: "bun" },
          ],
          default: "npm",
        },
      ]);

      console.log(`\n📦 Installing dependencies with ${packageManager}...\n`);

      try {
        // Use --ignore-workspace for pnpm to avoid hoisting to parent workspace
        const installCmd =
          packageManager === "pnpm"
            ? "pnpm install --ignore-workspace"
            : `${packageManager} install`;
        await runCommand(installCmd, projectPath);

        // For local setup, rebuild native modules (better-sqlite3)
        if (setupType === "local") {
          console.log("\n🔧 Building native modules...\n");
          const rebuildCmd =
            packageManager === "yarn"
              ? "yarn rebuild better-sqlite3"
              : packageManager === "bun"
                ? "bun pm rebuild better-sqlite3"
                : `${packageManager} rebuild better-sqlite3`;
          await runCommand(rebuildCmd, projectPath);
        }

        console.log("\n✅ Dependencies installed successfully!\n");

        // For local setup, run migrations and seed
        if (setupType === "local") {
          const { shouldSetup } = await inquirer.prompt([
            {
              type: "confirm",
              name: "shouldSetup",
              message:
                "Would you like to run migrations and seed the database?",
              default: true,
            },
          ]);

          if (shouldSetup) {
            // Ask for admin credentials
            const credentials = await inquirer.prompt<AdminCredentials>([
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

            console.log("\n🔄 Running migrations...\n");
            await runCommand(`${packageManager} run migrate`, projectPath);
            console.log("\n🌱 Seeding database...\n");
            // Pass credentials as arguments to the seed script
            const seedCmd = `${packageManager} run seed -- "${credentials.username}" "${credentials.password}"`;
            await runCommand(seedCmd, projectPath);
          }
        }

        const { shouldStart } = await inquirer.prompt([
          {
            type: "confirm",
            name: "shouldStart",
            message: "Would you like to start the development server?",
            default: true,
          },
        ]);

        if (shouldStart) {
          console.log("\n🚀 Starting development server...\n");
          await runCommand(`${packageManager} run dev`, projectPath);
        }
      } catch (error) {
        console.error("\n❌ An error occurred:", error);
      }
    }

    if (!shouldInstall) {
      console.log("Next steps:");
      console.log(`  cd ${projectName}`);

      if (setupType === "local") {
        console.log("  npm install");
        console.log("  npm run migrate");
        console.log("  npm run seed -- <email> <password>");
        console.log("  npm run dev");
      } else {
        console.log("  npm install");
        console.log("  npm run db:migrate");
        console.log("  npm run seed");
        console.log("  npm run dev");
      }

      console.log("\nFor more information, visit: https://authhero.net/docs\n");
    }
  });

program.parse(process.argv);
