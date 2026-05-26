import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import {
  CodeExecutor,
  DataAdapters,
  Strategy,
} from "@authhero/adapter-interfaces";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import * as x509 from "@peculiar/x509";
import {
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
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";

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

  const data: DataAdapters = createAdapters(db);

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

  // Add the Username-Password-Authentication connection
  await data.connections.create("tenantId", {
    id: "Username-Password-Authentication",
    name: "Username-Password-Authentication",
    strategy: USERNAME_PASSWORD_PROVIDER,
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

  const certificate = new x509.X509Certificate(signingKey.cert);
  const publicKey = await certificate.publicKey.export();
  const jwkKey = await crypto.subtle.exportKey("jwk", publicKey);
  const mockEmailService = new MockEmailService();
  const mockSmsService = new MockSmsService();

  const dataWithServices = {
    ...data,
    emailService: mockEmailService,
    smsService: mockSmsService,
  };

  const env: Bindings = {
    data: dataWithServices,
    JWKS_SERVICE: {
      fetch: async () =>
        new Response(
          JSON.stringify({
            keys: [{ ...jwkKey, kid: signingKey.kid }],
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        ),
    },
    JWKS_URL: "http://localhost:3000/.well-known/jwks.json",
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

  const apps = init({
    dataAdapter: dataWithServices,
    hooks: args.hooks,
    entityHooks: args.entityHooks,
    ...(args.outbox ? { outbox: { enabled: true, maxRetries: 1 } } : {}),
    ...(args.usernamePasswordProvider
      ? { usernamePasswordProvider: args.usernamePasswordProvider }
      : {}),
    ...(args.codeExecutor ? { codeExecutor: args.codeExecutor } : {}),
  });
  return {
    ...apps,
    env,
    getSentEmails: mockEmailService.getSentEmails.bind(mockEmailService),
    getSentSms: mockSmsService.getSentSms.bind(mockSmsService),
  };
}
