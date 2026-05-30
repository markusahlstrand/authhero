import {
  AuthenticationMethodsAdapter,
  ClientConnectionsAdapter,
  ClientsAdapter,
  Connection,
  ConnectionsAdapter,
  DataAdapters,
  EmailProvidersAdapter,
  MigrationSourcesAdapter,
} from "@authhero/adapter-interfaces";
import {
  decryptField,
  encryptField,
  isEncrypted,
} from "../utils/field-encryption";

type Transform = (value: string, key: CryptoKey) => Promise<string>;

// Encrypt, but skip values that are already encrypted so writes are idempotent
// (a value read back through this wrapper is plaintext, but guarding is cheap
// insurance against double-encryption).
const encrypt: Transform = (value, key) =>
  isEncrypted(value) ? Promise.resolve(value) : encryptField(value, key);

const decrypt: Transform = (value, key) => decryptField(value, key);

async function mapClientSecret<T extends { client_secret?: string }>(
  entity: T,
  key: CryptoKey,
  transform: Transform,
): Promise<T> {
  if (typeof entity.client_secret !== "string") return entity;
  return {
    ...entity,
    client_secret: await transform(entity.client_secret, key),
  };
}

async function mapTotpSecret<T extends { totp_secret?: string }>(
  entity: T,
  key: CryptoKey,
  transform: Transform,
): Promise<T> {
  if (typeof entity.totp_secret !== "string") return entity;
  return { ...entity, totp_secret: await transform(entity.totp_secret, key) };
}

async function mapConnectionOptions(
  options: Connection["options"] | undefined,
  key: CryptoKey,
  transform: Transform,
): Promise<Connection["options"] | undefined> {
  if (!options) return options;
  const next = { ...options };
  if (typeof next.client_secret === "string") {
    next.client_secret = await transform(next.client_secret, key);
  }
  if (typeof next.app_secret === "string") {
    next.app_secret = await transform(next.app_secret, key);
  }
  if (typeof next.twilio_token === "string") {
    next.twilio_token = await transform(next.twilio_token, key);
  }
  if (
    next.configuration &&
    typeof next.configuration.client_secret === "string"
  ) {
    next.configuration = {
      ...next.configuration,
      client_secret: await transform(next.configuration.client_secret, key),
    };
  }
  return next;
}

async function mapConnection<T extends { options?: Connection["options"] }>(
  entity: T,
  key: CryptoKey,
  transform: Transform,
): Promise<T> {
  if (!entity.options) return entity;
  return {
    ...entity,
    options: await mapConnectionOptions(entity.options, key, transform),
  };
}

async function mapCredentialsRecord(
  credentials: Record<string, unknown> | undefined,
  key: CryptoKey,
  transform: Transform,
): Promise<Record<string, unknown> | undefined> {
  if (!credentials) return credentials;
  const next: Record<string, unknown> = { ...credentials };
  for (const [field, value] of Object.entries(next)) {
    if (typeof value === "string") {
      next[field] = await transform(value, key);
    }
  }
  return next;
}

async function mapEmailProvider<
  T extends { credentials?: Record<string, unknown> },
>(entity: T, key: CryptoKey, transform: Transform): Promise<T> {
  if (!entity.credentials) return entity;
  const credentials = await mapCredentialsRecord(
    entity.credentials,
    key,
    transform,
  );
  return { ...entity, credentials };
}

async function mapMigrationSource<
  T extends { credentials?: { client_secret?: string } },
>(entity: T, key: CryptoKey, transform: Transform): Promise<T> {
  if (
    !entity.credentials ||
    typeof entity.credentials.client_secret !== "string"
  ) {
    return entity;
  }
  return {
    ...entity,
    credentials: {
      ...entity.credentials,
      client_secret: await transform(entity.credentials.client_secret, key),
    },
  };
}

function wrapClients(base: ClientsAdapter, key: CryptoKey): ClientsAdapter {
  return {
    create: async (tenant_id, params) =>
      mapClientSecret(
        await base.create(
          tenant_id,
          await mapClientSecret(params, key, encrypt),
        ),
        key,
        decrypt,
      ),
    get: async (tenant_id, client_id) => {
      const client = await base.get(tenant_id, client_id);
      return client ? mapClientSecret(client, key, decrypt) : client;
    },
    getByClientId: async (client_id) => {
      const client = await base.getByClientId(client_id);
      return client ? mapClientSecret(client, key, decrypt) : client;
    },
    remove: (tenant_id, client_id) => base.remove(tenant_id, client_id),
    list: async (tenant_id, params) => {
      const result = await base.list(tenant_id, params);
      return {
        ...result,
        clients: await Promise.all(
          result.clients.map((client) => mapClientSecret(client, key, decrypt)),
        ),
      };
    },
    update: async (tenant_id, client_id, client) =>
      base.update(
        tenant_id,
        client_id,
        await mapClientSecret(client, key, encrypt),
      ),
  };
}

function wrapConnections(
  base: ConnectionsAdapter,
  key: CryptoKey,
): ConnectionsAdapter {
  return {
    create: async (tenant_id, params) =>
      mapConnection(
        await base.create(tenant_id, await mapConnection(params, key, encrypt)),
        key,
        decrypt,
      ),
    remove: (tenant_id, connection_id) => base.remove(tenant_id, connection_id),
    get: async (tenant_id, connection_id) => {
      const connection = await base.get(tenant_id, connection_id);
      return connection ? mapConnection(connection, key, decrypt) : connection;
    },
    update: async (tenant_id, connection_id, params) =>
      base.update(
        tenant_id,
        connection_id,
        await mapConnection(params, key, encrypt),
      ),
    list: async (tenant_id, params) => {
      const result = await base.list(tenant_id, params);
      return {
        ...result,
        connections: await Promise.all(
          result.connections.map((connection) =>
            mapConnection(connection, key, decrypt),
          ),
        ),
      };
    },
  };
}

function wrapClientConnections(
  base: ClientConnectionsAdapter,
  key: CryptoKey,
): ClientConnectionsAdapter {
  return {
    listByClient: async (tenant_id, client_id) => {
      const connections = await base.listByClient(tenant_id, client_id);
      return Promise.all(
        connections.map((connection) => mapConnection(connection, key, decrypt)),
      );
    },
    updateByClient: (tenant_id, client_id, connection_ids) =>
      base.updateByClient(tenant_id, client_id, connection_ids),
    listByConnection: (tenant_id, connection_id) =>
      base.listByConnection(tenant_id, connection_id),
    addClientToConnection: (tenant_id, connection_id, client_id) =>
      base.addClientToConnection(tenant_id, connection_id, client_id),
    removeClientFromConnection: (tenant_id, connection_id, client_id) =>
      base.removeClientFromConnection(tenant_id, connection_id, client_id),
  };
}

function wrapEmailProviders(
  base: EmailProvidersAdapter,
  key: CryptoKey,
): EmailProvidersAdapter {
  return {
    create: async (tenant_id, emailProvider) =>
      base.create(
        tenant_id,
        await mapEmailProvider(emailProvider, key, encrypt),
      ),
    update: async (tenant_id, emailProvider) =>
      base.update(
        tenant_id,
        await mapEmailProvider(emailProvider, key, encrypt),
      ),
    get: async (tenant_id) => {
      const provider = await base.get(tenant_id);
      return provider ? mapEmailProvider(provider, key, decrypt) : provider;
    },
    remove: (tenant_id) => base.remove(tenant_id),
  };
}

function wrapAuthenticationMethods(
  base: AuthenticationMethodsAdapter,
  key: CryptoKey,
): AuthenticationMethodsAdapter {
  return {
    create: async (tenant_id, method) =>
      mapTotpSecret(
        await base.create(tenant_id, await mapTotpSecret(method, key, encrypt)),
        key,
        decrypt,
      ),
    get: async (tenant_id, method_id) => {
      const method = await base.get(tenant_id, method_id);
      return method ? mapTotpSecret(method, key, decrypt) : method;
    },
    getByCredentialId: async (tenant_id, credential_id) => {
      const method = await base.getByCredentialId(tenant_id, credential_id);
      return method ? mapTotpSecret(method, key, decrypt) : method;
    },
    list: async (tenant_id, user_id) => {
      const methods = await base.list(tenant_id, user_id);
      return Promise.all(
        methods.map((method) => mapTotpSecret(method, key, decrypt)),
      );
    },
    update: async (tenant_id, method_id, data) =>
      mapTotpSecret(
        await base.update(
          tenant_id,
          method_id,
          await mapTotpSecret(data, key, encrypt),
        ),
        key,
        decrypt,
      ),
    remove: (tenant_id, method_id) => base.remove(tenant_id, method_id),
  };
}

function wrapMigrationSources(
  base: MigrationSourcesAdapter,
  key: CryptoKey,
): MigrationSourcesAdapter {
  return {
    create: async (tenant_id, migration_source) =>
      mapMigrationSource(
        await base.create(
          tenant_id,
          await mapMigrationSource(migration_source, key, encrypt),
        ),
        key,
        decrypt,
      ),
    get: async (tenant_id, id) => {
      const source = await base.get(tenant_id, id);
      return source ? mapMigrationSource(source, key, decrypt) : source;
    },
    list: async (tenant_id) => {
      const sources = await base.list(tenant_id);
      return Promise.all(
        sources.map((source) => mapMigrationSource(source, key, decrypt)),
      );
    },
    remove: (tenant_id, id) => base.remove(tenant_id, id),
    update: async (tenant_id, id, migration_source) =>
      base.update(
        tenant_id,
        id,
        await mapMigrationSource(migration_source, key, encrypt),
      ),
  };
}

/**
 * Wraps a DataAdapters instance so that sensitive credential fields are
 * transparently encrypted on write and decrypted on read. Only the adapters
 * that hold secrets are wrapped; everything else passes through unchanged.
 *
 * Encrypted columns: clients.client_secret, connections.options
 * (client_secret/app_secret/twilio_token/configuration.client_secret),
 * email_providers.credentials, authentication_methods.totp_secret,
 * migration_sources.credentials.client_secret.
 *
 * clientConnections.listByClient is also wrapped so its returned Connection
 * objects are decrypted — getEnrichedClient uses this path to load connections
 * for the OAuth strategies.
 *
 * Private keys (keys.pkcs7, dkim_private_key) are intentionally NOT covered.
 */
export function createEncryptedDataAdapter(
  data: DataAdapters,
  key: CryptoKey,
): DataAdapters {
  const wrapped: DataAdapters = {
    ...data,
    clients: wrapClients(data.clients, key),
    connections: wrapConnections(data.connections, key),
    clientConnections: wrapClientConnections(data.clientConnections, key),
    emailProviders: wrapEmailProviders(data.emailProviders, key),
    authenticationMethods: wrapAuthenticationMethods(
      data.authenticationMethods,
      key,
    ),
    transaction: (fn) =>
      data.transaction((trx) => fn(createEncryptedDataAdapter(trx, key))),
  };

  if (data.migrationSources) {
    wrapped.migrationSources = wrapMigrationSources(data.migrationSources, key);
  }

  return wrapped;
}
