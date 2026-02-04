import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { DataAdapters } from "@authhero/adapter-interfaces";
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

type getEnvParams = {
  testTenantLanguage?: string;
  emailValidation?: "enabled" | "enforced" | "disabled";
  mockEmail?: boolean;
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
};

export type TestServer = {
  env: Bindings;
  getSentEmails: () => any[];
  getSentSms: () => any[];
} & ReturnType<typeof init>;

export async function getTestServer(
  args: getEnvParams = {},
): Promise<TestServer> {
  const dialect = new SqliteDialect({
    database: new SQLite(":memory:"),
  });

  // Don't use getDb here as it will reuse the connection
  const db = new Kysely<Database>({ dialect: dialect });

  await migrateToLatest(db, false);

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
      disable_sign_ups: "false",
      email_validation: "disabled",
    },
  });

  // Add the email connection
  await data.connections.create("tenantId", {
    id: "email",
    name: "Email",
    strategy: "email",
    options: {
      authentication_method: "magic_link",
    },
  });

  // Add the Username-Password-Authentication connection
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

  const env: Bindings = {
    data,
    hooks: args.hooks,
    emailProviders: {
      "mock-email": mockEmailService.sendEmail.bind(mockEmailService),
    },
    smsProviders: {
      twilio: mockSmsService.sendSms.bind(mockSmsService),
    },
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

  const apps = init({
    dataAdapter: data,
    entityHooks: args.entityHooks,
  });
  return {
    ...apps,
    env,
    getSentEmails: mockEmailService.getSentEmails.bind(mockEmailService),
    getSentSms: mockSmsService.getSentSms.bind(mockSmsService),
  };
}
