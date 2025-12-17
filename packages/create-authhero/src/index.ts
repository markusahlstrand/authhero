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
        bcryptjs: "^2.4.3",
        "better-sqlite3": "latest",
        hono: "^4.6.0",
        kysely: "latest",
        nanoid: "^5.0.0",
      },
      devDependencies: {
        "@types/bcryptjs": "^2.4.6",
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

function hashPassword(password: string): string {
  // Simple bcrypt-style placeholder - in real usage, the seed script will hash properly
  // This is just for generating the seed file content
  return `$2a$10$placeholder_hash_${Buffer.from(password).toString("base64")}`;
}

function generateSeedFileContent(
  setupType: SetupType,
  credentials: AdminCredentials,
): string {
  const { username, password } = credentials;

  if (setupType === "local") {
    // TypeScript seed file for local setup - uses raw SQL for compatibility
    return `import { SqliteDialect, Kysely, sql } from "kysely";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

async function main() {
  const dialect = new SqliteDialect({
    database: new Database("db.sqlite"),
  });

  const db = new Kysely<any>({ dialect });

  const adminEmail = "${username}";
  const adminPassword = "${password}";
  const tenantId = "default";
  const now = new Date().toISOString();

  try {
    // Check if tenant already exists
    const existingTenant = await db
      .selectFrom("tenants")
      .selectAll()
      .where("id", "=", tenantId)
      .executeTakeFirst();

    if (!existingTenant) {
      console.log(\`Creating tenant "\${tenantId}"...\`);
      await db
        .insertInto("tenants")
        .values({
          id: tenantId,
          friendly_name: "Default Tenant",
          audience: "https://api.example.com",
          sender_email: "noreply@example.com",
          sender_name: "AuthHero",
          created_at: now,
          updated_at: now,
        })
        .execute();
      console.log("✅ Tenant created");
    } else {
      console.log(\`Tenant "\${tenantId}" already exists, skipping...\`);
    }

    // Check if admin user already exists (users table has user_id, not id)
    const existingUser = await db
      .selectFrom("users")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("email", "=", adminEmail)
      .executeTakeFirst();

    if (!existingUser) {
      console.log(\`Creating admin user "\${adminEmail}"...\`);

      const userId = \`auth2|\${nanoid()}\`;

      // Create the admin user (note: user_id not id)
      await db
        .insertInto("users")
        .values({
          user_id: userId,
          tenant_id: tenantId,
          email: adminEmail,
          email_verified: 1,
          created_at: now,
          updated_at: now,
          connection: "Username-Password-Authentication",
          provider: "auth2",
          is_social: 0,
          login_count: 0,
          app_metadata: JSON.stringify({ strategy: "Username-Password-Authentication" }),
        })
        .execute();

      // Hash the password and create password record
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      // Try new password_history table first, fall back to passwords table
      try {
        await db
          .insertInto("password_history")
          .values({
            id: nanoid(),
            tenant_id: tenantId,
            user_id: userId,
            password: hashedPassword,
            algorithm: "bcrypt",
            is_current: 1,
            created_at: now,
            updated_at: now,
          })
          .execute();
      } catch {
        // Fall back to old passwords table schema
        await db
          .insertInto("passwords")
          .values({
            tenant_id: tenantId,
            user_id: userId,
            password: hashedPassword,
            algorithm: "bcrypt",
            created_at: now,
            updated_at: now,
          })
          .execute();
      }

      console.log("✅ Admin user created");
      console.log(\`   Email: \${adminEmail}\`);
    } else {
      console.log(\`Admin user "\${adminEmail}" already exists, skipping...\`);
    }

    // Create Username-Password-Authentication connection (for password login)
    const existingConnection = await db
      .selectFrom("connections")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("name", "=", "Username-Password-Authentication")
      .executeTakeFirst();

    if (!existingConnection) {
      console.log("Creating password connection...");
      await db
        .insertInto("connections")
        .values({
          id: nanoid(),
          tenant_id: tenantId,
          name: "Username-Password-Authentication",
          strategy: "Username-Password-Authentication",
          options: "{}",
          created_at: now,
          updated_at: now,
        })
        .execute();
      console.log("✅ Password connection created");
    } else {
      console.log("Password connection already exists, skipping...");
    }

    // Create default client
    const existingClient = await db
      .selectFrom("clients")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("client_id", "=", "default")
      .executeTakeFirst();

    if (!existingClient) {
      console.log("Creating default client...");
      await db
        .insertInto("clients")
        .values({
          client_id: "default",
          tenant_id: tenantId,
          name: "Default Application",
          callbacks: JSON.stringify(["https://manage.authhero.net/auth-callback"]),
          allowed_origins: "[]",
          web_origins: "[]",
          client_aliases: "[]",
          allowed_clients: "[]",
          allowed_logout_urls: "[]",
          session_transfer: "{}",
          oidc_logout: "{}",
          grant_types: JSON.stringify(["authorization_code", "refresh_token"]),
          jwt_configuration: "{}",
          signing_keys: "[]",
          encryption_key: "{}",
          addons: "{}",
          client_metadata: "{}",
          mobile: "{}",
          native_social_login: "{}",
          refresh_token: "{}",
          default_organization: "{}",
          client_authentication_methods: "{}",
          signed_request_object: "{}",
          token_quota: "{}",
          connections: JSON.stringify(["Username-Password-Authentication"]),
          created_at: now,
          updated_at: now,
        })
        .execute();
      console.log("✅ Default client created");
      console.log("   Client ID: default");
      console.log("   Callback URL: https://manage.authhero.net/auth-callback");
    } else {
      console.log("Default client already exists, skipping...");
    }

    console.log("\\n🎉 Seeding complete!");
  } finally {
    await db.destroy();
  }
}

main().catch(console.error);
`;
  } else {
    // SQL seed file for Cloudflare D1
    const now = new Date().toISOString();
    const tenantId = "default";
    const userId = `auth|${Date.now()}`;
    const hashedPw = hashPassword(password);

    return `-- Seed file for AuthHero
-- Admin user: ${username}

-- Create default tenant
INSERT OR IGNORE INTO tenants (id, name, audience, sender_email, sender_name, created_at, updated_at)
VALUES ('${tenantId}', 'Default Tenant', 'https://api.example.com', 'noreply@example.com', 'AuthHero', '${now}', '${now}');

-- Create admin user
-- Note: Password hash should be generated using bcrypt. This is a placeholder.
-- You should update the password hash after running migrations.
INSERT OR IGNORE INTO users (id, tenant_id, email, email_verified, created_at, updated_at, is_social, login_count)
VALUES ('${userId}', '${tenantId}', '${username}', 1, '${now}', '${now}', 0, 0);

-- Password placeholder - update this with a proper bcrypt hash
-- You can generate one using: npx bcrypt-cli hash "${password}"
INSERT OR IGNORE INTO passwords (tenant_id, user_id, password, created_at, updated_at)
VALUES ('${tenantId}', '${userId}', '${hashedPw}', '${now}', '${now}');
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

    // Ask for admin credentials
    const credentials = await inquirer.prompt<AdminCredentials>([
      {
        type: "input",
        name: "username",
        message: "Admin email:",
        default: "admin@example.com",
        validate: (input: string) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(input) || "Please enter a valid email address";
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
    const seedContent = generateSeedFileContent(
      setupType as SetupType,
      credentials,
    );
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
          await runCommand("npm rebuild better-sqlite3", projectPath);
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
            console.log("\n🔄 Running migrations...\n");
            await runCommand(`${packageManager} run migrate`, projectPath);
            console.log("\n🌱 Seeding database...\n");
            await runCommand(`${packageManager} run seed`, projectPath);
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
        console.log("  npm run seed");
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
