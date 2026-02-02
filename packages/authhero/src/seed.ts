import { DataAdapters } from "@authhero/adapter-interfaces";
import { createX509Certificate } from "./utils/encryption";
import { userIdGenerate } from "./utils/user-id";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

/**
 * Management API scopes for the AuthHero Management API
 */
export const MANAGEMENT_API_SCOPES = [
  { description: "Read Client Grants", value: "read:client_grants" },
  { description: "Create Client Grants", value: "create:client_grants" },
  { description: "Delete Client Grants", value: "delete:client_grants" },
  { description: "Update Client Grants", value: "update:client_grants" },
  { description: "Read Users", value: "read:users" },
  { description: "Update Users", value: "update:users" },
  { description: "Delete Users", value: "delete:users" },
  { description: "Create Users", value: "create:users" },
  { description: "Read Users App Metadata", value: "read:users_app_metadata" },
  {
    description: "Update Users App Metadata",
    value: "update:users_app_metadata",
  },
  {
    description: "Delete Users App Metadata",
    value: "delete:users_app_metadata",
  },
  {
    description: "Create Users App Metadata",
    value: "create:users_app_metadata",
  },
  { description: "Read Custom User Blocks", value: "read:user_custom_blocks" },
  {
    description: "Create Custom User Blocks",
    value: "create:user_custom_blocks",
  },
  {
    description: "Delete Custom User Blocks",
    value: "delete:user_custom_blocks",
  },
  { description: "Create User Tickets", value: "create:user_tickets" },
  { description: "Read Clients", value: "read:clients" },
  { description: "Update Clients", value: "update:clients" },
  { description: "Delete Clients", value: "delete:clients" },
  { description: "Create Clients", value: "create:clients" },
  { description: "Read Client Keys", value: "read:client_keys" },
  { description: "Update Client Keys", value: "update:client_keys" },
  { description: "Delete Client Keys", value: "delete:client_keys" },
  { description: "Create Client Keys", value: "create:client_keys" },
  { description: "Read Client Credentials", value: "read:client_credentials" },
  {
    description: "Update Client Credentials",
    value: "update:client_credentials",
  },
  {
    description: "Delete Client Credentials",
    value: "delete:client_credentials",
  },
  {
    description: "Create Client Credentials",
    value: "create:client_credentials",
  },
  { description: "Read Connections", value: "read:connections" },
  { description: "Update Connections", value: "update:connections" },
  { description: "Delete Connections", value: "delete:connections" },
  { description: "Create Connections", value: "create:connections" },
  { description: "Read Resource Servers", value: "read:resource_servers" },
  { description: "Update Resource Servers", value: "update:resource_servers" },
  { description: "Delete Resource Servers", value: "delete:resource_servers" },
  { description: "Create Resource Servers", value: "create:resource_servers" },
  { description: "Read Device Credentials", value: "read:device_credentials" },
  {
    description: "Update Device Credentials",
    value: "update:device_credentials",
  },
  {
    description: "Delete Device Credentials",
    value: "delete:device_credentials",
  },
  {
    description: "Create Device Credentials",
    value: "create:device_credentials",
  },
  { description: "Read Rules", value: "read:rules" },
  { description: "Update Rules", value: "update:rules" },
  { description: "Delete Rules", value: "delete:rules" },
  { description: "Create Rules", value: "create:rules" },
  { description: "Read Rules Configs", value: "read:rules_configs" },
  { description: "Update Rules Configs", value: "update:rules_configs" },
  { description: "Delete Rules Configs", value: "delete:rules_configs" },
  { description: "Read Hooks", value: "read:hooks" },
  { description: "Update Hooks", value: "update:hooks" },
  { description: "Delete Hooks", value: "delete:hooks" },
  { description: "Create Hooks", value: "create:hooks" },
  { description: "Read Actions", value: "read:actions" },
  { description: "Update Actions", value: "update:actions" },
  { description: "Delete Actions", value: "delete:actions" },
  { description: "Create Actions", value: "create:actions" },
  { description: "Read Email Provider", value: "read:email_provider" },
  { description: "Update Email Provider", value: "update:email_provider" },
  { description: "Delete Email Provider", value: "delete:email_provider" },
  { description: "Create Email Provider", value: "create:email_provider" },
  { description: "Blacklist Tokens", value: "blacklist:tokens" },
  { description: "Read Stats", value: "read:stats" },
  { description: "Read Insights", value: "read:insights" },
  { description: "Read Tenant Settings", value: "read:tenant_settings" },
  { description: "Update Tenant Settings", value: "update:tenant_settings" },
  { description: "Read Logs", value: "read:logs" },
  { description: "Read logs relating to users", value: "read:logs_users" },
  { description: "Read Shields", value: "read:shields" },
  { description: "Create Shields", value: "create:shields" },
  { description: "Update Shields", value: "update:shields" },
  { description: "Delete Shields", value: "delete:shields" },
  {
    description: "Read Anomaly Detection Blocks",
    value: "read:anomaly_blocks",
  },
  {
    description: "Delete Anomaly Detection Blocks",
    value: "delete:anomaly_blocks",
  },
  { description: "Update Triggers", value: "update:triggers" },
  { description: "Read Triggers", value: "read:triggers" },
  { description: "Read User Grants", value: "read:grants" },
  { description: "Delete User Grants", value: "delete:grants" },
  {
    description: "Read Guardian factors configuration",
    value: "read:guardian_factors",
  },
  { description: "Update Guardian factors", value: "update:guardian_factors" },
  {
    description: "Read Guardian enrollments",
    value: "read:guardian_enrollments",
  },
  {
    description: "Delete Guardian enrollments",
    value: "delete:guardian_enrollments",
  },
  {
    description: "Create enrollment tickets for Guardian",
    value: "create:guardian_enrollment_tickets",
  },
  { description: "Read Users IDP tokens", value: "read:user_idp_tokens" },
  {
    description: "Create password checking jobs",
    value: "create:passwords_checking_job",
  },
  {
    description: "Deletes password checking job and all its resources",
    value: "delete:passwords_checking_job",
  },
  {
    description: "Read custom domains configurations",
    value: "read:custom_domains",
  },
  {
    description: "Delete custom domains configurations",
    value: "delete:custom_domains",
  },
  {
    description: "Configure new custom domains",
    value: "create:custom_domains",
  },
  {
    description: "Update custom domain configurations",
    value: "update:custom_domains",
  },
  { description: "Read email templates", value: "read:email_templates" },
  { description: "Create email templates", value: "create:email_templates" },
  { description: "Update email templates", value: "update:email_templates" },
  {
    description: "Read Multifactor Authentication policies",
    value: "read:mfa_policies",
  },
  {
    description: "Update Multifactor Authentication policies",
    value: "update:mfa_policies",
  },
  { description: "Read roles", value: "read:roles" },
  { description: "Create roles", value: "create:roles" },
  { description: "Delete roles", value: "delete:roles" },
  { description: "Update roles", value: "update:roles" },
  { description: "Read prompts settings", value: "read:prompts" },
  { description: "Update prompts settings", value: "update:prompts" },
  { description: "Read branding settings", value: "read:branding" },
  { description: "Update branding settings", value: "update:branding" },
  { description: "Delete branding settings", value: "delete:branding" },
  { description: "Read log_streams", value: "read:log_streams" },
  { description: "Create log_streams", value: "create:log_streams" },
  { description: "Delete log_streams", value: "delete:log_streams" },
  { description: "Update log_streams", value: "update:log_streams" },
  { description: "Create signing keys", value: "create:signing_keys" },
  { description: "Read signing keys", value: "read:signing_keys" },
  { description: "Update signing keys", value: "update:signing_keys" },
  { description: "Read entity limits", value: "read:limits" },
  { description: "Update entity limits", value: "update:limits" },
  { description: "Create role members", value: "create:role_members" },
  { description: "Read role members", value: "read:role_members" },
  { description: "Update role members", value: "delete:role_members" },
  { description: "Read entitlements", value: "read:entitlements" },
  { description: "Read attack protection", value: "read:attack_protection" },
  {
    description: "Update attack protection",
    value: "update:attack_protection",
  },
  {
    description: "Read organization summary",
    value: "read:organizations_summary",
  },
  {
    description: "Create Authentication Methods",
    value: "create:authentication_methods",
  },
  {
    description: "Read Authentication Methods",
    value: "read:authentication_methods",
  },
  {
    description: "Update Authentication Methods",
    value: "update:authentication_methods",
  },
  {
    description: "Delete Authentication Methods",
    value: "delete:authentication_methods",
  },
  { description: "Read Organizations", value: "read:organizations" },
  { description: "Update Organizations", value: "update:organizations" },
  { description: "Create Organizations", value: "create:organizations" },
  { description: "Delete Organizations", value: "delete:organizations" },
  {
    description: "Administer Organizations",
    value: "admin:organizations",
  },
  {
    description: "Read Organization Discovery Domains",
    value: "read:organization_discovery_domains",
  },
  {
    description: "Update Organization Discovery Domains",
    value: "update:organization_discovery_domains",
  },
  {
    description: "Create Organization Discovery Domains",
    value: "create:organization_discovery_domains",
  },
  {
    description: "Delete Organization Discovery Domains",
    value: "delete:organization_discovery_domains",
  },
  {
    description: "Create organization members",
    value: "create:organization_members",
  },
  {
    description: "Read organization members",
    value: "read:organization_members",
  },
  {
    description: "Delete organization members",
    value: "delete:organization_members",
  },
  {
    description: "Create organization connections",
    value: "create:organization_connections",
  },
  {
    description: "Read organization connections",
    value: "read:organization_connections",
  },
  {
    description: "Update organization connections",
    value: "update:organization_connections",
  },
  {
    description: "Delete organization connections",
    value: "delete:organization_connections",
  },
  {
    description: "Create organization member roles",
    value: "create:organization_member_roles",
  },
  {
    description: "Read organization member roles",
    value: "read:organization_member_roles",
  },
  {
    description: "Delete organization member roles",
    value: "delete:organization_member_roles",
  },
  {
    description: "Create organization invitations",
    value: "create:organization_invitations",
  },
  {
    description: "Read organization invitations",
    value: "read:organization_invitations",
  },
  {
    description: "Delete organization invitations",
    value: "delete:organization_invitations",
  },
  { description: "Read SCIM configuration", value: "read:scim_config" },
  { description: "Create SCIM configuration", value: "create:scim_config" },
  { description: "Update SCIM configuration", value: "update:scim_config" },
  { description: "Delete SCIM configuration", value: "delete:scim_config" },
  { description: "Create SCIM token", value: "create:scim_token" },
  { description: "Read SCIM token", value: "read:scim_token" },
  { description: "Delete SCIM token", value: "delete:scim_token" },
  {
    description: "Delete a Phone Notification Provider",
    value: "delete:phone_providers",
  },
  {
    description: "Create a Phone Notification Provider",
    value: "create:phone_providers",
  },
  {
    description: "Read a Phone Notification Provider",
    value: "read:phone_providers",
  },
  {
    description: "Update a Phone Notification Provider",
    value: "update:phone_providers",
  },
  {
    description: "Delete a Phone Notification Template",
    value: "delete:phone_templates",
  },
  {
    description: "Create a Phone Notification Template",
    value: "create:phone_templates",
  },
  {
    description: "Read a Phone Notification Template",
    value: "read:phone_templates",
  },
  {
    description: "Update a Phone Notification Template",
    value: "update:phone_templates",
  },
  { description: "Create encryption keys", value: "create:encryption_keys" },
  { description: "Read encryption keys", value: "read:encryption_keys" },
  { description: "Update encryption keys", value: "update:encryption_keys" },
  { description: "Delete encryption keys", value: "delete:encryption_keys" },
  { description: "Read Sessions", value: "read:sessions" },
  { description: "Update Sessions", value: "update:sessions" },
  { description: "Delete Sessions", value: "delete:sessions" },
  { description: "Read Refresh Tokens", value: "read:refresh_tokens" },
  { description: "Update Refresh Tokens", value: "update:refresh_tokens" },
  { description: "Delete Refresh Tokens", value: "delete:refresh_tokens" },
  {
    description: "Create Self Service Profiles",
    value: "create:self_service_profiles",
  },
  {
    description: "Read Self Service Profiles",
    value: "read:self_service_profiles",
  },
  {
    description: "Update Self Service Profiles",
    value: "update:self_service_profiles",
  },
  {
    description: "Delete Self Service Profiles",
    value: "delete:self_service_profiles",
  },
  {
    description: "Create SSO Access Tickets",
    value: "create:sso_access_tickets",
  },
  {
    description: "Delete SSO Access Tickets",
    value: "delete:sso_access_tickets",
  },
  { description: "Read Forms", value: "read:forms" },
  { description: "Update Forms", value: "update:forms" },
  { description: "Delete Forms", value: "delete:forms" },
  { description: "Create Forms", value: "create:forms" },
  { description: "Read Flows", value: "read:flows" },
  { description: "Update Flows", value: "update:flows" },
  { description: "Delete Flows", value: "delete:flows" },
  { description: "Create Flows", value: "create:flows" },
  { description: "Read Flows Vault items", value: "read:flows_vault" },
  {
    description: "Read Flows Vault connections",
    value: "read:flows_vault_connections",
  },
  {
    description: "Update Flows Vault connections",
    value: "update:flows_vault_connections",
  },
  {
    description: "Delete Flows Vault connections",
    value: "delete:flows_vault_connections",
  },
  {
    description: "Create Flows Vault connections",
    value: "create:flows_vault_connections",
  },
  { description: "Read Flows Executions", value: "read:flows_executions" },
  { description: "Delete Flows Executions", value: "delete:flows_executions" },
  {
    description: "Read Connections Options",
    value: "read:connections_options",
  },
  {
    description: "Update Connections Options",
    value: "update:connections_options",
  },
  {
    description: "Read Self Service Profile Custom Texts",
    value: "read:self_service_profile_custom_texts",
  },
  {
    description: "Update Self Service Profile Custom Texts",
    value: "update:self_service_profile_custom_texts",
  },
  { description: "Create Network ACLs", value: "create:network_acls" },
  { description: "Update Network ACLs", value: "update:network_acls" },
  { description: "Read Network ACLs", value: "read:network_acls" },
  { description: "Delete Network ACLs", value: "delete:network_acls" },
  {
    description: "Delete Verifiable Digital Credential Templates",
    value: "delete:vdcs_templates",
  },
  {
    description: "Read Verifiable Digital Credential Templates",
    value: "read:vdcs_templates",
  },
  {
    description: "Create Verifiable Digital Credential Templates",
    value: "create:vdcs_templates",
  },
  {
    description: "Update Verifiable Digital Credential Templates",
    value: "update:vdcs_templates",
  },
  {
    description: "Create Customer Provided Public Signing Keys",
    value: "create:custom_signing_keys",
  },
  {
    description: "Read Customer Provided Public Signing Keys",
    value: "read:custom_signing_keys",
  },
  {
    description: "Update Customer Provided Public Signing Keys",
    value: "update:custom_signing_keys",
  },
  {
    description: "Delete Customer Provided Public Signing Keys",
    value: "delete:custom_signing_keys",
  },
  {
    description: "List Federated Connections Tokensets belonging to a user",
    value: "read:federated_connections_tokens",
  },
  {
    description: "Delete Federated Connections Tokensets belonging to a user",
    value: "delete:federated_connections_tokens",
  },
  {
    description: "Create User Attribute Profiles",
    value: "create:user_attribute_profiles",
  },
  {
    description: "Read User Attribute Profiles",
    value: "read:user_attribute_profiles",
  },
  {
    description: "Update User Attribute Profiles",
    value: "update:user_attribute_profiles",
  },
  {
    description: "Delete User Attribute Profiles",
    value: "delete:user_attribute_profiles",
  },
  { description: "Read event streams", value: "read:event_streams" },
  { description: "Create event streams", value: "create:event_streams" },
  { description: "Delete event streams", value: "delete:event_streams" },
  { description: "Update event streams", value: "update:event_streams" },
  {
    description: "Read event stream deliveries",
    value: "read:event_deliveries",
  },
  {
    description: "Redeliver event(s) to an event stream",
    value: "update:event_deliveries",
  },
  {
    description: "Create Connection Profiles",
    value: "create:connection_profiles",
  },
  {
    description: "Read Connection Profiles",
    value: "read:connection_profiles",
  },
  {
    description: "Update Connection Profiles",
    value: "update:connection_profiles",
  },
  {
    description: "Delete Connection Profiles",
    value: "delete:connection_profiles",
  },
  {
    description: "Read Organization Client Grants",
    value: "read:organization_client_grants",
  },
  {
    description: "Create Organization Client Grants",
    value: "create:organization_client_grants",
  },
  {
    description: "Delete Organization Client Grants",
    value: "delete:organization_client_grants",
  },
  {
    description: "Create Token Exchange Profile",
    value: "create:token_exchange_profiles",
  },
  {
    description: "Read Token Exchange Profiles",
    value: "read:token_exchange_profiles",
  },
  {
    description: "Update Token Exchange Profile",
    value: "update:token_exchange_profiles",
  },
  {
    description: "Delete Token Exchange Profile",
    value: "delete:token_exchange_profiles",
  },
  { description: "Read connection keys", value: "read:connections_keys" },
  { description: "Update connection keys", value: "update:connections_keys" },
  { description: "Create connection keys", value: "create:connections_keys" },
  // Tenant management scopes
  { description: "Read Tenants", value: "read:tenants" },
  { description: "Create Tenants", value: "create:tenants" },
  { description: "Update Tenants", value: "update:tenants" },
  { description: "Delete Tenants", value: "delete:tenants" },
  // Simplified auth scopes used by management API endpoints
  {
    description: "Read access to authentication resources",
    value: "auth:read",
  },
  {
    description: "Write access to authentication resources",
    value: "auth:write",
  },
];

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
   * The tenant ID to create (defaults to "control_plane")
   */
  tenantId?: string;
  /**
   * The tenant name (defaults to "Control Plane")
   */
  tenantName?: string;
  /**
   * The audience URL for the tenant.
   * For the main/management tenant, defaults to `urn:authhero:management`.
   */
  audience?: string;
  /**
   * Whether this is the control plane tenant (the main management tenant).
   * If true, the audience will default to `urn:authhero:management`.
   * @default true
   */
  isControlPlane?: boolean;
  /**
   * The default client ID (defaults to "default")
   */
  clientId?: string;
  /**
   * Callback URLs for the default client
   */
  callbacks?: string[];
  /**
   * Allowed logout URLs for the default client
   */
  allowedLogoutUrls?: string[];
  /**
   * Whether to log progress (defaults to true)
   */
  debug?: boolean;
  /**
   * The issuer URL (used to construct the Management API identifier)
   */
  issuer?: string;
}

export interface SeedResult {
  tenantId: string;
  userId: string;
  email: string;
  clientId: string;
  clientSecret: string;
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
    tenantId = "control_plane",
    tenantName = "Control Plane",
    isControlPlane = true,
    clientId = "default",
    callbacks = [
      "https://manage.authhero.net/auth-callback",
      "https://local.authhero.net/auth-callback",
      "https://localhost:5173/auth-callback",
      "https://localhost:3000/auth-callback",
    ],
    allowedLogoutUrls = [
      "https://manage.authhero.net",
      "https://local.authhero.net",
      "https://localhost:5173",
      "https://localhost:3000",
    ],
    debug = true,
  } = options;

  // Determine the audience based on tenant type
  // Main tenant uses urn:authhero:management for cross-tenant management
  // Child tenants use urn:authhero:tenant:{tenantId} for tenant-specific access
  const audience =
    options.audience ||
    (isControlPlane
      ? "urn:authhero:management"
      : `urn:authhero:tenant:${tenantId}`);

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

    // Enable allow_organization_name_in_authentication_api for main tenant
    // This includes org_name in tokens, which is needed for multi-tenancy
    // where org_name should match tenant_id
    if (isControlPlane) {
      await adapters.tenants.update(tenantId, {
        allow_organization_name_in_authentication_api: true,
        // Enable permission inheritance so users with global roles (like admin:organizations)
        // can get org tokens without being a member of each organization
        flags: {
          inherit_global_permissions_in_organizations: true,
        },
      });
    }

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
    userId = `auth2|${userIdGenerate()}`;
    await adapters.users.create(tenantId, {
      user_id: userId,
      email: adminEmail,
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth2",
    });

    // Hash and store password
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
  let clientSecret: string;

  if (!existingClient) {
    if (debug) {
      console.log("Creating default client...");
    }

    // Generate client secret (same pattern as management API route)
    clientSecret = nanoid();
    await adapters.clients.create(tenantId, {
      client_id: clientId,
      client_secret: clientSecret,
      name: "Default Application",
      callbacks,
      allowed_logout_urls: allowedLogoutUrls,
      connections: ["Username-Password-Authentication"],
    });

    if (debug) {
      console.log("✅ Default client created");
      console.log(`   Client ID: ${clientId}`);
      console.log(`   Callback URLs: ${callbacks.join(", ")}`);
      console.log(`   Allowed Logout URLs: ${allowedLogoutUrls.join(", ")}`);
    }
  } else {
    // Use existing client's secret
    clientSecret = existingClient.client_secret || "";
    if (debug) {
      console.log("Default client already exists, skipping...");
    }
  }

  // Create Management API resource server
  // Always use urn:authhero:management as the identifier for the Management API
  // This ensures react-admin can use the same audience for both single and multi-tenant modes
  const managementApiIdentifier = "urn:authhero:management";
  const existingResourceServers = await adapters.resourceServers.list(
    tenantId,
    {},
  );
  const hasManagementApi = existingResourceServers.resource_servers.some(
    (rs) => rs.identifier === managementApiIdentifier,
  );

  if (!hasManagementApi) {
    if (debug) {
      console.log("Creating Management API resource server...");
    }
    await adapters.resourceServers.create(tenantId, {
      name: "Authhero Management API",
      identifier: managementApiIdentifier,
      allow_offline_access: true,
      skip_consent_for_verifiable_first_party_clients: false,
      token_lifetime: 86400,
      token_lifetime_for_web: 7200,
      signing_alg: "RS256",
      scopes: MANAGEMENT_API_SCOPES,
      options: {
        enforce_policies: true,
        token_dialect: "access_token_authz",
      },
    });
    if (debug) {
      console.log("✅ Management API resource server created");
      console.log(`   Identifier: ${managementApiIdentifier}`);
      console.log(`   Scopes: ${MANAGEMENT_API_SCOPES.length} permissions`);
    }
  } else if (debug) {
    console.log("Management API resource server already exists, skipping...");
  }

  // Create organization with tenant_id as the name (for org-scoped token support)
  // The ID is a generated random string like Auth0's org_xxx pattern
  // Users can authenticate with organization: "control_plane" (the name) when
  // allow_organization_name_in_authentication_api is enabled on the tenant
  const { organizations: existingOrgs } = await adapters.organizations.list(
    tenantId,
    { q: `name:${tenantId}` },
  );
  let organization = existingOrgs[0];
  if (!organization) {
    if (debug) {
      console.log(`Creating organization "${tenantId}"...`);
    }
    organization = await adapters.organizations.create(tenantId, {
      id: `org_${nanoid()}`,
      name: tenantId,
      display_name: tenantName,
    });
    if (debug) {
      console.log("✅ Organization created");
    }
  } else if (debug) {
    console.log(`Organization "${tenantId}" already exists, skipping...`);
  }

  // Create admin role with auth:read and auth:write permissions
  const adminRoleName = "Tenant Admin";
  const existingRoles = await adapters.roles.list(tenantId, {});
  let adminRole = existingRoles.roles.find((r) => r.name === adminRoleName);

  if (!adminRole) {
    if (debug) {
      console.log(`Creating admin role "${adminRoleName}"...`);
    }
    adminRole = await adapters.roles.create(tenantId, {
      name: adminRoleName,
      description: "Full access to tenant management operations",
    });

    // Assign all management API permissions to the admin role
    // Use urn:authhero:management as the identifier to match the resource server
    const adminPermissions = MANAGEMENT_API_SCOPES.map((scope) => ({
      role_id: adminRole!.id,
      resource_server_identifier: managementApiIdentifier,
      permission_name: scope.value,
    }));
    await adapters.rolePermissions.assign(
      tenantId,
      adminRole.id,
      adminPermissions,
    );

    if (debug) {
      console.log(
        `✅ Admin role created with ${MANAGEMENT_API_SCOPES.length} permissions`,
      );
    }
  } else if (debug) {
    console.log(`Admin role "${adminRoleName}" already exists, skipping...`);
  }

  // Add admin user to the organization
  const existingMembership =
    await adapters.userOrganizations.listUserOrganizations(
      tenantId,
      userId,
      {},
    );
  const isAlreadyMember = existingMembership.organizations.some(
    (org) => org.id === organization.id,
  );

  if (!isAlreadyMember) {
    if (debug) {
      console.log(
        `Adding admin user to organization "${organization.name}"...`,
      );
    }
    await adapters.userOrganizations.create(tenantId, {
      user_id: userId,
      organization_id: organization.id,
    });
    if (debug) {
      console.log("✅ Admin user added to organization");
    }
  } else if (debug) {
    console.log("Admin user already in organization, skipping...");
  }

  // Assign admin role to the user in the organization
  const existingUserRoles = await adapters.userRoles.list(
    tenantId,
    userId,
    undefined,
    organization.id,
  );
  const hasAdminRole = existingUserRoles.some((r) => r.id === adminRole!.id);

  if (!hasAdminRole) {
    if (debug) {
      console.log(
        `Assigning admin role to user in organization "${organization.name}"...`,
      );
    }
    await adapters.userRoles.create(
      tenantId,
      userId,
      adminRole.id,
      organization.id,
    );
    if (debug) {
      console.log("✅ Admin role assigned to user");
    }
  } else if (debug) {
    console.log("Admin user already has admin role, skipping...");
  }

  // Also assign admin role as a global role (without organization)
  // This ensures permissions are included in tokens even when not using organizations
  // Important for single-tenant setups where users may not authenticate with an organization
  const existingGlobalUserRoles = await adapters.userRoles.list(
    tenantId,
    userId,
    undefined,
    "", // Empty string = global role (no organization)
  );
  const hasGlobalAdminRole = existingGlobalUserRoles.some(
    (r) => r.id === adminRole!.id,
  );

  if (!hasGlobalAdminRole) {
    if (debug) {
      console.log("Assigning global admin role to user...");
    }
    await adapters.userRoles.create(
      tenantId,
      userId,
      adminRole.id,
      "", // Empty string = global role
    );
    if (debug) {
      console.log("✅ Global admin role assigned to user");
    }
  } else if (debug) {
    console.log("Admin user already has global admin role, skipping...");
  }

  if (debug) {
    console.log("\n🎉 Seeding complete!");
  }

  return {
    tenantId,
    userId,
    email: adminEmail,
    clientId,
    clientSecret,
  };
}
