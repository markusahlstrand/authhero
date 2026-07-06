import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import {
  CodeExecutor,
  DataAdapters,
  RateLimitAdapter,
  Strategy,
} from "@authhero/adapter-interfaces";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import { createInMemoryCache } from "../../src/adapters/cache/in-memory";
import { base64 } from "oslo/encoding";
import {
  createEncryptedDataAdapter,
  loadEncryptionKey,
  init,
  OnExecuteCredentialsExchange,
  OnExecutePostUserRegistration,
  OnExecutePreUserRegistration,
  OnExecutePreUserUpdate,
  OnExecutePreUserDeletion,
  OnExecutePostUserDeletion,
  OnExecuteValidateRegistrationUsername,
  EntityHooksConfig,
} from "../../src";
import { getCertificate } from "./token";
import { Bindings } from "../../src/types";
import { MockEmailService } from "./mock-email-service";
import { MockSmsService } from "./mock-sms-service";
import { mockStrategy } from "./mock-strategy";

type getEnvParams = {
  testTenantLanguage?: string;
  emailValidation?: "enabled" | "enforced" | "disabled";
  mockEmail?: boolean;
  outbox?: boolean;
  hooks?: {
    onExecuteCredentialsExchange?: OnExecuteCredentialsExchange;
    onExecutePreUserRegistration?: OnExecutePreUserRegistration;
    onExecutePostUserRegistration?: OnExecutePostUserRegistration;
    onExecutePreUserUpdate?: OnExecutePreUserUpdate;
    onExecutePreUserDeletion?: OnExecutePreUserDeletion;
    onExecutePostUserDeletion?: OnExecutePostUserDeletion;
    onExecuteValidateRegistrationUsername?: OnExecuteValidateRegistrationUsername;
  };
  entityHooks?: EntityHooksConfig;
  usernamePasswordProvider?: (params: {
    tenant_id: string;
  }) => "auth0" | "auth2";
  codeExecutor?: CodeExecutor;
  // When true, wrap the data adapter with at-rest encryption so all fixtures
  // and request handling exercise the encrypted path.
  encryption?: boolean;
  // Optional rate-limit adapter injected into `env.data.rateLimit` so tests
  // can exercise the opt-in throttling paths (passwordless OTP, pre-login).
  rateLimit?: RateLimitAdapter;
  // Optional decorator applied to the data adapter *after* fixtures are
  // seeded but *before* it's passed to `init`. Use for things like
  // `countingAdapter` that should only observe request-time calls, not
  // setup writes.
  wrapDataAdapter?: (data: DataAdapters) => DataAdapters;
  // When true, attach a persistent in-memory cache to `data.cache` so the
  // ClientBundle + addCaching layers survive across requests within a test.
  // Without this, every request gets a fresh per-request cache that
  // immediately dies — making warm-cache assertions impossible.
  persistentCache?: boolean;
  // Optional middleware mounted inside the management API after the CORS
  // middleware (the `config.tenantDispatch` integration point).
  tenantDispatch?: import("hono").MiddlewareHandler;
  // Optional handler driving POST /tenants/{id}/redeploy (the
  // `config.tenantUpgrade` integration point).
  tenantUpgrade?: (tenantId: string) => Promise<void>;
  // Optional executor driving POST /tenants/{id}/operations (the
  // `config.tenantOperationExecutor` integration point, issue #1026).
  tenantOperationExecutor?: import("../../src/types").TenantOperationExecutorBinding;
  // Optional static CORS allow-list passed through to `init`.
  allowedOrigins?: string[];
};

export type TestServer = {
  env: Bindings;
  getSentEmails: () => any[];
  getSentSms: () => any[];
} & ReturnType<typeof init>;

// Cache the schema-only SQLite image so the 171 migrations only run once per
// worker process. Each `getTestServer()` then instantiates an in-memory DB
// directly from the serialized buffer (microseconds) rather than re-running
// the full migration chain (~340 ms per call).
//
// Vitest workers each get their own module instance, so the cache is
// per-worker. With 8 workers and 905 setups, this turns ~5 minutes of pure
// migration overhead per CI run into ~3 seconds.
let cachedSchemaImage: Buffer | null = null;

async function getMigratedSchemaImage(): Promise<Buffer> {
  if (cachedSchemaImage) return cachedSchemaImage;
  const sqlite = new SQLite(":memory:");
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  await migrateToLatest(db, false);
  // Serialize BEFORE destroying the Kysely wrapper — Kysely.destroy() closes
  // the underlying SQLite connection, after which serialize() throws
  // "database connection is not open".
  cachedSchemaImage = sqlite.serialize();
  await db.destroy();
  return cachedSchemaImage;
}

export async function getTestServer(
  args: getEnvParams = {},
): Promise<TestServer> {
  const sqlite = new SQLite(await getMigratedSchemaImage());
  const dialect = new SqliteDialect({ database: sqlite });
  const db = new Kysely<Database>({ dialect });
  // Schema is already present from the cached image — no migration call.

  let data: DataAdapters = createAdapters(db);

  if (args.encryption) {
    const key = await loadEncryptionKey(
      base64.encode(crypto.getRandomValues(new Uint8Array(32))),
    );
    data = createEncryptedDataAdapter(data, key);
  }

  // ----------------------------------------
  // Create fixtures
  // ----------------------------------------

  // Add a signing key
  const signingKey = await getCertificate();
  await data.keys.create(signingKey);

  // Add a test tenant
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    default_audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  // Always create email provider for tests (required after removing DEFAULT_TENANT_ID fallback)
  await data.emailProviders.create("tenantId", {
    name: "mock-email",
    enabled: true,
    credentials: {
      api_key: "apiKey",
    },
  });

  // Add a client
  await data.clients.create("tenantId", {
    client_id: "clientId",
    client_secret: "clientSecret",
    name: "Test Client",
    callbacks: ["https://example.com/callback", "http://localhost:3000/*"],
    allowed_logout_urls: ["https://example.com/callback"],
    web_origins: ["https://example.com"],
    client_metadata: {
      email_validation: "disabled",
    },
  });

  // Add the email connection
  await data.connections.create("tenantId", {
    id: "email",
    name: "Email",
    strategy: Strategy.EMAIL,
    options: {
      authentication_method: "magic_link",
    },
  });

  // Add the Username-Password-Authentication connection. Legacy tenants
  // persist the strategy as the "auth2" provider literal — keep that here
  // so tests prove new users are still stamped with the "auth0" provider.
  await data.connections.create("tenantId", {
    id: "Username-Password-Authentication",
    name: "Username-Password-Authentication",
    strategy: "auth2",
    options: {},
  });

  // Add the mock-strategy social connection (required after removing DEFAULT_TENANT_ID fallback)
  await data.connections.create("tenantId", {
    id: "mock-strategy",
    name: "mock-strategy",
    strategy: "mock-strategy",
    options: {
      client_id: "mockClientId",
      client_secret: "mockClientSecret",
    },
  });

  // Register the tenant's default audience as a resource server so /authorize
  // doesn't reject test requests with "Service not found".
  await data.resourceServers.create("tenantId", {
    name: "Example API",
    identifier: "https://example.com",
  });

  // Add a test user with OIDC profile claims for testing
  await data.users.create("tenantId", {
    email: "foo@example.com",
    email_verified: true,
    name: "Test User",
    given_name: "Test",
    family_name: "User",
    middle_name: "Middle",
    nickname: "Test User",
    username: "testuser",
    picture: "https://example.com/test.png",
    profile: "https://example.com/profile",
    website: "https://example.com",
    gender: "other",
    birthdate: "1990-01-15",
    zoneinfo: "America/Los_Angeles",
    locale: "en-US",
    connection: "email",
    provider: "email",
    is_social: false,
    user_id: "email|userId",
  });

  const mockEmailService = new MockEmailService();
  const mockSmsService = new MockSmsService();

  const dataWithServices = {
    ...data,
    emailService: mockEmailService,
    smsService: mockSmsService,
    ...(args.rateLimit ? { rateLimit: args.rateLimit } : {}),
    ...(args.persistentCache
      ? {
          cache: createInMemoryCache({
            defaultTtlSeconds: 300,
            maxEntries: 1000,
            cleanupIntervalMs: 0,
          }),
        }
      : {}),
  };

  const env: Bindings = {
    data: dataWithServices,
    AUTH_URL: "http://localhost:3000",
    ISSUER: "http://localhost:3000/",
    ENVIRONMENT: "test",
    JWKS_CACHE_TIMEOUT_IN_SECONDS: 3600,
    ORGANIZATION_NAME: "Test Organization",
    STRATEGIES: {
      "mock-strategy": mockStrategy,
    },
    SAML_SIGN_URL: "http://localhost:3000/saml/sign",
  };

  if (args.outbox) {
    env.outbox = { enabled: true, maxRetries: 1 };
  }

  if (args.usernamePasswordProvider) {
    env.usernamePasswordProvider = args.usernamePasswordProvider;
  }

  if (args.codeExecutor) {
    env.codeExecutor = args.codeExecutor;
  }

  const adapterForInit = args.wrapDataAdapter
    ? args.wrapDataAdapter(dataWithServices)
    : dataWithServices;

  const apps = init({
    dataAdapter: adapterForInit,
    hooks: args.hooks,
    entityHooks: args.entityHooks,
    ...(args.outbox ? { outbox: { enabled: true, maxRetries: 1 } } : {}),
    ...(args.usernamePasswordProvider
      ? { usernamePasswordProvider: args.usernamePasswordProvider }
      : {}),
    ...(args.codeExecutor ? { codeExecutor: args.codeExecutor } : {}),
    ...(args.tenantDispatch ? { tenantDispatch: args.tenantDispatch } : {}),
    ...(args.tenantUpgrade ? { tenantUpgrade: args.tenantUpgrade } : {}),
    ...(args.tenantOperationExecutor
      ? { tenantOperationExecutor: args.tenantOperationExecutor }
      : {}),
    ...(args.allowedOrigins ? { allowedOrigins: args.allowedOrigins } : {}),
  });
  return {
    ...apps,
    env,
    getSentEmails: mockEmailService.getSentEmails.bind(mockEmailService),
    getSentSms: mockSmsService.getSentSms.bind(mockSmsService),
  };
}
