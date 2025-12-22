import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createX509Certificate } from "./utils/encryption";

export interface SeedOptions {
  /**
   * The admin user's email address
   */
  adminEmail: string;
  /**
   * The admin user's password (will be hashed with bcrypt)
   */
  adminPassword: string;
  /**
   * The tenant ID to create (defaults to "default")
   */
  tenantId?: string;
  /**
   * The tenant name (defaults to "Default Tenant")
   */
  tenantName?: string;
  /**
   * The audience URL for the tenant
   */
  audience?: string;
  /**
   * The default client ID (defaults to "default")
   */
  clientId?: string;
  /**
   * Callback URLs for the default client
   */
  callbacks?: string[];
  /**
   * Whether to log progress (defaults to true)
   */
  debug?: boolean;
}

export interface SeedResult {
  tenantId: string;
  userId: string;
  email: string;
  clientId: string;
}

/**
 * Seed the AuthHero database with initial data.
 * Creates a default tenant, admin user, password connection, and default client.
 *
 * @example
 * ```ts
 * import { seed } from "authhero";
 * import createAdapters from "@authhero/kysely-adapter";
 *
 * const adapters = createAdapters(db);
 *
 * await seed(adapters, {
 *   adminEmail: "admin@example.com",
 *   adminPassword: "secretpassword",
 * });
 * ```
 */
export async function seed(
  adapters: DataAdapters,
  options: SeedOptions,
): Promise<SeedResult> {
  const {
    adminEmail,
    adminPassword,
    tenantId = "default",
    tenantName = "Default Tenant",
    audience = "urn:default",
    clientId = "default",
    callbacks = [
      "https://manage.authhero.net/auth-callback",
      "https://local.authhero.net/auth-callback",
      "https://localhost:5173/auth-callback",
      "https://localhost:3000/auth-callback",
    ],
    debug = true,
  } = options;

  // Check if tenant already exists
  const existingTenant = await adapters.tenants.get(tenantId);
  if (!existingTenant) {
    if (debug) {
      console.log(`Creating tenant "${tenantId}"...`);
    }
    await adapters.tenants.create({
      id: tenantId,
      friendly_name: tenantName,
      audience,
      sender_email: "noreply@example.com",
      sender_name: "AuthHero",
    });
    if (debug) {
      console.log("✅ Tenant created");
    }
  } else if (debug) {
    console.log(`Tenant "${tenantId}" already exists, skipping...`);
  }

  // Check if signing keys exist
  const { signingKeys } = await adapters.keys.list({ q: "type:jwt_signing" });
  if (signingKeys.length === 0) {
    if (debug) {
      console.log("Creating signing key...");
    }
    const signingKey = await createX509Certificate({
      name: `CN=${tenantId}`,
    });
    await adapters.keys.create(signingKey);
    if (debug) {
      console.log("✅ Signing key created");
    }
  } else if (debug) {
    console.log("Signing key already exists, skipping...");
  }

  // Check if admin user already exists
  const existingUsers = await adapters.users.list(tenantId, {
    q: `email:${adminEmail}`,
  });

  let userId: string;

  if (existingUsers.users.length === 0) {
    if (debug) {
      console.log(`Creating admin user "${adminEmail}"...`);
    }

    // Create the admin user
    const user = await adapters.users.create(tenantId, {
      user_id: `auth2|${nanoid()}`,
      email: adminEmail,
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth2",
    });
    userId = user.user_id;

    // Hash the password and create password record
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await adapters.passwords.create(tenantId, {
      user_id: userId,
      password: hashedPassword,
      algorithm: "bcrypt",
      is_current: true,
    });

    if (debug) {
      console.log("✅ Admin user created");
      console.log(`   Email: ${adminEmail}`);
    }
  } else {
    userId = existingUsers.users[0]!.user_id;
    if (debug) {
      console.log(`Admin user "${adminEmail}" already exists, skipping...`);
    }
  }

  // Create Username-Password-Authentication connection
  const existingConnections = await adapters.connections.list(tenantId);
  const hasPasswordConnection = existingConnections.connections.some(
    (c) => c.name === "Username-Password-Authentication",
  );

  if (!hasPasswordConnection) {
    if (debug) {
      console.log("Creating password connection...");
    }
    await adapters.connections.create(tenantId, {
      name: "Username-Password-Authentication",
      strategy: "Username-Password-Authentication",
      options: {},
    });
    if (debug) {
      console.log("✅ Password connection created");
    }
  } else if (debug) {
    console.log("Password connection already exists, skipping...");
  }

  // Create default client
  const existingClient = await adapters.clients.get(tenantId, clientId);
  if (!existingClient) {
    if (debug) {
      console.log("Creating default client...");
    }
    await adapters.clients.create(tenantId, {
      client_id: clientId,
      name: "Default Application",
      callbacks,
      connections: ["Username-Password-Authentication"],
    });
    if (debug) {
      console.log("✅ Default client created");
      console.log(`   Client ID: ${clientId}`);
      console.log(`   Callback URLs: ${callbacks.join(", ")}`);
    }
  } else if (debug) {
    console.log("Default client already exists, skipping...");
  }

  if (debug) {
    console.log("\n🎉 Seeding complete!");
  }

  return {
    tenantId,
    userId,
    email: adminEmail,
    clientId,
  };
}
