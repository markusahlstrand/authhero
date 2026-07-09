import { Client, DataAdapters } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { MANAGEMENT_API_AUDIENCE } from "../middlewares/authentication";

/**
 * Whether a client can anchor interactive, user-facing flows (universal login,
 * the DCR `/connect/start` consent bounce, etc.).
 *
 * A client is considered interactive unless it is explicitly machine-to-machine:
 * `non_interactive`/`resource_server` app types, or a grant list that only
 * allows `client_credentials`. Clients with no explicit `grant_types` are
 * treated as interactive — that matches how a freshly created "Default App"
 * (which relies on the authorize flow) behaves in AuthHero and Auth0.
 */
export function isInteractiveClient(
  client: Pick<Client, "app_type" | "grant_types">,
): boolean {
  if (
    client.app_type === "non_interactive" ||
    client.app_type === "resource_server"
  ) {
    return false;
  }

  const grantTypes = client.grant_types ?? [];
  if (grantTypes.length === 0) {
    return true;
  }

  return grantTypes.some(
    (grant) => grant === "authorization_code" || grant === "implicit",
  );
}

/** A single Management API scope entry (`{ value, description }`). */
export interface ManagementApiScope {
  value: string;
  description?: string;
}

export interface ProvisionDefaultClientsOptions {
  /** Display name for an auto-created Default App. Defaults to "Default App". */
  defaultAppName?: string;
  /** Callback URLs for an auto-created Default App. */
  callbacks?: string[];
  /** Allowed logout URLs for an auto-created Default App. */
  allowedLogoutUrls?: string[];
  /** Allowed web origins for an auto-created Default App. */
  webOrigins?: string[];
  /**
   * Also provision an M2M "API Explorer" client authorized against the
   * Management API (Auth0 parity). Defaults to `true`. Requires
   * `managementApiScopes` to seed the resource server when it is missing.
   */
  createManagementClient?: boolean;
  /** Management API identifier. Defaults to `urn:authhero:management`. */
  managementApiIdentifier?: string;
  /**
   * Scopes used to seed the Management API resource server when it does not
   * yet exist, and to authorize the M2M client's grant. When omitted, the
   * resource server is assumed to already exist and the grant is created with
   * no explicit scope.
   */
  managementApiScopes?: ManagementApiScope[];
  /** Emit progress logs (used by the seed script). */
  debug?: boolean;
}

const MANAGEMENT_CLIENT_NAME = "API Explorer Application";

export interface ProvisionDefaultClientsResult {
  /** The client the tenant's `default_client_id` now points at. */
  defaultClientId: string;
  /** The auto-provisioned M2M Management API client, if one was created/found. */
  managementClientId?: string;
}

/**
 * Ensures a tenant has a designated interactive default client and (optionally)
 * an M2M Management API client, then points `tenant.default_client_id` at the
 * former.
 *
 * Idempotent and import-safe:
 * - Respects an already-set, still-valid `default_client_id`.
 * - Reuses an existing interactive client instead of creating a duplicate.
 * - Skips the M2M client when one already exists.
 *
 * Shared by every tenant-creation path (the seed/bootstrap script and the
 * multi-tenancy provisioning hook) so new tenants come with a sensible anchor
 * client by construction — see issue #1007.
 */
export async function provisionDefaultClients(
  adapters: DataAdapters,
  tenantId: string,
  options: ProvisionDefaultClientsOptions = {},
): Promise<ProvisionDefaultClientsResult> {
  const {
    defaultAppName = "Default App",
    callbacks = [],
    allowedLogoutUrls = [],
    webOrigins = [],
    createManagementClient = true,
    managementApiIdentifier = MANAGEMENT_API_AUDIENCE,
    managementApiScopes,
    debug = false,
  } = options;

  const tenant = await adapters.tenants.get(tenantId);
  if (!tenant) {
    throw new Error(`Cannot provision clients: tenant "${tenantId}" not found`);
  }

  // 1. Resolve the interactive default client.
  const defaultClient = await resolveDefaultClient(adapters, tenantId, {
    currentDefaultClientId: tenant.default_client_id,
    defaultAppName,
    callbacks,
    allowedLogoutUrls,
    webOrigins,
    debug,
  });

  if (tenant.default_client_id !== defaultClient.client_id) {
    await adapters.tenants.update(tenantId, {
      default_client_id: defaultClient.client_id,
    });
    if (debug) {
      console.log(`✅ default_client_id set to "${defaultClient.client_id}"`);
    }
  }

  // 2. Optionally provision the M2M Management API client.
  let managementClientId: string | undefined;
  if (createManagementClient) {
    managementClientId = await ensureManagementClient(adapters, tenantId, {
      managementApiIdentifier,
      managementApiScopes,
      debug,
    });
  }

  return { defaultClientId: defaultClient.client_id, managementClientId };
}

async function resolveDefaultClient(
  adapters: DataAdapters,
  tenantId: string,
  opts: {
    currentDefaultClientId?: string;
    defaultAppName: string;
    callbacks: string[];
    allowedLogoutUrls: string[];
    webOrigins: string[];
    debug: boolean;
  },
): Promise<Client> {
  // Respect an already-configured, still-valid interactive default client.
  if (opts.currentDefaultClientId) {
    const existing = await adapters.clients.get(
      tenantId,
      opts.currentDefaultClientId,
    );
    if (existing && isInteractiveClient(existing)) {
      return existing;
    }
  }

  // Reuse any existing interactive client (e.g. the seed's "Default
  // Application") rather than creating a duplicate.
  const { clients } = await adapters.clients.list(tenantId);
  const interactive = clients.find(isInteractiveClient);
  if (interactive) {
    return interactive;
  }

  // No interactive client exists yet — create the Default App.
  const created = await adapters.clients.create(tenantId, {
    client_id: nanoid(),
    client_secret: nanoid(),
    name: opts.defaultAppName,
    app_type: "regular_web",
    is_first_party: true,
    grant_types: ["authorization_code", "refresh_token"],
    callbacks: opts.callbacks,
    allowed_logout_urls: opts.allowedLogoutUrls,
    web_origins: opts.webOrigins,
    // Leave connections empty so all of the tenant's connections are offered
    // at login (see helpers/client.ts). New connections become available
    // automatically without touching the default client.
    connections: [],
    client_metadata: { universal_login_version: "2" },
  });
  if (opts.debug) {
    console.log(`✅ Default App created (${created.client_id})`);
  }
  return created;
}

async function ensureManagementClient(
  adapters: DataAdapters,
  tenantId: string,
  opts: {
    managementApiIdentifier: string;
    managementApiScopes?: ManagementApiScope[];
    debug: boolean;
  },
): Promise<string | undefined> {
  const { clients } = await adapters.clients.list(tenantId);
  const existing = clients.find(
    (client) =>
      client.app_type === "non_interactive" &&
      client.name === MANAGEMENT_CLIENT_NAME,
  );
  if (existing) {
    // The client may have been created by a prior run that failed before its
    // Management API grant was written. Restore the grant if it is missing so
    // re-runs recover from a partial failure.
    await ensureManagementApiGrant(adapters, tenantId, existing.client_id, opts);
    return existing.client_id;
  }

  // The M2M client mints Management API tokens via client_credentials, so the
  // resource server has to exist. Seed it when scopes were supplied and it is
  // missing (mirrors the seed script's defaults).
  if (opts.managementApiScopes) {
    const { resource_servers } = await adapters.resourceServers.list(
      tenantId,
      {},
    );
    const hasManagementApi = resource_servers.some(
      (rs) => rs.identifier === opts.managementApiIdentifier,
    );
    if (!hasManagementApi) {
      await adapters.resourceServers.create(tenantId, {
        name: "Authhero Management API",
        identifier: opts.managementApiIdentifier,
        allow_offline_access: true,
        skip_consent_for_verifiable_first_party_clients: false,
        token_lifetime: 86400,
        token_lifetime_for_web: 7200,
        signing_alg: "RS256",
        scopes: opts.managementApiScopes,
        options: {
          enforce_policies: true,
          token_dialect: "access_token_authz",
        },
      });
      if (opts.debug) {
        console.log("✅ Management API resource server created");
      }
    }
  }

  const client = await adapters.clients.create(tenantId, {
    client_id: nanoid(),
    client_secret: nanoid(),
    name: MANAGEMENT_CLIENT_NAME,
    app_type: "non_interactive",
    is_first_party: true,
    grant_types: ["client_credentials"],
  });

  await ensureManagementApiGrant(adapters, tenantId, client.client_id, opts);

  if (opts.debug) {
    console.log(`✅ Management API (M2M) client created (${client.client_id})`);
  }
  return client.client_id;
}

/**
 * Ensures the M2M client has a grant against the Management API, creating one
 * only when it is missing. Idempotent so re-runs recover from a partial prior
 * run that created the client but not its grant.
 */
async function ensureManagementApiGrant(
  adapters: DataAdapters,
  tenantId: string,
  clientId: string,
  opts: {
    managementApiIdentifier: string;
    managementApiScopes?: ManagementApiScope[];
  },
): Promise<void> {
  const { client_grants } = await adapters.clientGrants.list(tenantId);
  const hasGrant = client_grants.some(
    (grant) =>
      grant.client_id === clientId &&
      grant.audience === opts.managementApiIdentifier,
  );
  if (hasGrant) {
    return;
  }

  await adapters.clientGrants.create(tenantId, {
    client_id: clientId,
    audience: opts.managementApiIdentifier,
    scope: opts.managementApiScopes?.map((scope) => scope.value) ?? [],
  });
}
