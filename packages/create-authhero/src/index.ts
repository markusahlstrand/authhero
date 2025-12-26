#!/usr/bin/env node

import { Command } from "commander";
import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const program = new Command();

type SetupType = "local" | "cloudflare-simple" | "cloudflare-multitenant";
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
  remote?: boolean;
  yes?: boolean;
}

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
        "dev:local": "wrangler dev --port 3000 --local-protocol https",
        "dev:remote":
          "wrangler dev --port 3000 --local-protocol https --remote",
        dev: "wrangler dev --port 3000 --local-protocol https",
        deploy: "wrangler deploy",
        "db:migrate:local": "wrangler d1 migrations apply AUTH_DB --local",
        "db:migrate:remote": "wrangler d1 migrations apply AUTH_DB --remote",
        migrate: "wrangler d1 migrations apply AUTH_DB --local",
        "db:generate": "drizzle-kit generate",
        "seed:local": "node seed-helper.js",
        "seed:remote": "node seed-helper.js '' '' remote",
        seed: "node seed-helper.js",
      },
      dependencies: {
        "@authhero/drizzle": "latest",
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
        "drizzle-kit": "^0.31.0",
        "drizzle-orm": "^0.44.0",
        typescript: "^5.5.0",
        wrangler: "^3.0.0",
      },
    }),
    seedFile: "seed.ts",
  },
  "cloudflare-multitenant": {
    name: "Cloudflare Multi-Tenant (Production)",
    description:
      "Production-grade multi-tenant setup with D1 database and tenant management",
    templateDir: "cloudflare-multitenant",
    packageJson: (projectName) => ({
      name: projectName,
      version: "1.0.0",
      type: "module",
      scripts: {
        "dev:local": "wrangler dev --port 3000 --local-protocol https",
        "dev:remote":
          "wrangler dev --port 3000 --local-protocol https --remote",
        dev: "wrangler dev --port 3000 --local-protocol https",
        deploy: "wrangler deploy",
        "db:migrate:local": "wrangler d1 migrations apply AUTH_DB --local",
        "db:migrate:remote": "wrangler d1 migrations apply AUTH_DB --remote",
        migrate: "wrangler d1 migrations apply AUTH_DB --local",
        "db:generate": "drizzle-kit generate",
        "seed:local": "node seed-helper.js",
        "seed:remote": "node seed-helper.js '' '' remote",
        seed: "node seed-helper.js",
      },
      dependencies: {
        "@authhero/drizzle": "latest",
        "@authhero/kysely-adapter": "latest",
        "@authhero/multi-tenancy": "latest",
        "@hono/swagger-ui": "^0.5.0",
        "@hono/zod-openapi": "^0.19.0",
        hono: "^4.6.0",
        kysely: "latest",
        "kysely-d1": "latest",
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

function generateSeedFileContent(): string {
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

program
  .version("1.0.0")
  .description("Create a new AuthHero project")
  .argument("[project-name]", "name of the project")
  .option(
    "-t, --template <type>",
    "template type: local, cloudflare-simple, or cloudflare-multitenant",
  )
  .option("-e, --email <email>", "admin email address")
  .option("-p, --password <password>", "admin password (min 8 characters)")
  .option(
    "--package-manager <pm>",
    "package manager to use: npm, yarn, pnpm, or bun",
  )
  .option("--skip-install", "skip installing dependencies")
  .option("--skip-migrate", "skip running database migrations")
  .option("--skip-seed", "skip seeding the database")
  .option("--skip-start", "skip starting the development server")
  .option("--remote", "use remote mode for cloudflare-simple (production D1)")
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
        !["local", "cloudflare-simple", "cloudflare-multitenant"].includes(
          options.template,
        )
      ) {
        console.error(`❌ Invalid template: ${options.template}`);
        console.error(
          "Valid options: local, cloudflare-simple, cloudflare-multitenant",
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
      setupType = answer.setupType;
    }

    const config = setupConfigs[setupType];

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

    // Generate seed file for local setup only
    // cloudflare-simple and cloudflare-multitenant have seed.ts in the template
    if (setupType === "local") {
      const seedContent = generateSeedFileContent();
      const seedFileName = "src/seed.ts";
      fs.writeFileSync(path.join(projectPath, seedFileName), seedContent);
    }

    console.log(
      `\n✅ Project "${projectName}" has been created with ${config.name} setup!\n`,
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

        // Track the mode for cloudflare setups
        let mode: "local" | "remote" = options.remote ? "remote" : "local";

        // For local and cloudflare setups, run migrations and seed
        if (
          setupType === "local" ||
          setupType === "cloudflare-simple" ||
          setupType === "cloudflare-multitenant"
        ) {
          // For cloudflare setups, ask if they want to use local or remote mode
          if (
            (setupType === "cloudflare-simple" ||
              setupType === "cloudflare-multitenant") &&
            !isNonInteractive &&
            !options.remote
          ) {
            const modeAnswer = await inquirer.prompt([
              {
                type: "list",
                name: "mode",
                message: "Would you like to run in local mode or remote mode?",
                choices: [
                  {
                    name: "Local (using local D1 database)",
                    value: "local",
                    short: "Local",
                  },
                  {
                    name: "Remote (using production D1 database)",
                    value: "remote",
                    short: "Remote",
                  },
                ],
                default: "local",
              },
            ]);
            mode = modeAnswer.mode;
          }

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
              const migrateCmd =
                (setupType === "cloudflare-simple" ||
                  setupType === "cloudflare-multitenant") &&
                mode === "remote"
                  ? `${packageManager} run db:migrate:remote`
                  : `${packageManager} run migrate`;
              await runCommand(migrateCmd, projectPath);
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
                const seedCmd =
                  mode === "remote"
                    ? `${packageManager} run seed:remote`
                    : `${packageManager} run seed:local`;

                await runCommandWithEnv(seedCmd, projectPath, {
                  ADMIN_EMAIL: credentials.username,
                  ADMIN_PASSWORD: credentials.password,
                });
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
          console.log(
            "\n🚀 Starting development server on https://localhost:3000 ...\n",
          );
          const devCmd =
            (setupType === "cloudflare-simple" ||
              setupType === "cloudflare-multitenant") &&
            mode === "remote"
              ? `${packageManager} run dev:remote`
              : `${packageManager} run dev`;
          await runCommand(devCmd, projectPath);
        }

        // Success message for non-interactive mode
        if (isNonInteractive && !shouldStart) {
          console.log("\n✅ Setup complete!");
          console.log(`\nTo start the development server:`);
          console.log(`  cd ${projectName}`);
          if (
            (setupType === "cloudflare-simple" ||
              setupType === "cloudflare-multitenant") &&
            mode === "remote"
          ) {
            console.log(`  npm run dev:remote`);
          } else {
            console.log(`  npm run dev`);
          }
          if (
            setupType === "cloudflare-simple" ||
            setupType === "cloudflare-multitenant"
          ) {
            console.log(
              `\nServer will be available at: https://localhost:3000`,
            );
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
      } else if (
        setupType === "cloudflare-simple" ||
        setupType === "cloudflare-multitenant"
      ) {
        console.log("  npm install");
        console.log(
          "  npm run migrate  # or npm run db:migrate:remote for production",
        );
        console.log(
          "  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed",
        );
        console.log("  npm run dev  # or npm run dev:remote for production");
        console.log("\nServer will be available at: https://localhost:3000");
      }

      console.log("\nFor more information, visit: https://authhero.net/docs\n");
    }
  });

program.parse(process.argv);
