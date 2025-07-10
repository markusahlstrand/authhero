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
  };
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
    name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  if (args.mockEmail) {
    await data.emailProviders.create("tenantId", {
      name: "mock-email",
      enabled: true,
      credentials: {
        api_key: "apiKey",
      },
    });
  }

  // Add a client
  await data.applications.create("tenantId", {
    id: "clientId",
    client_secret: "clientSecret",
    name: "Test Client",
    callbacks: ["https://example.com/callback", "http://localhost:3000/*"],
    allowed_logout_urls: ["https://example.com/callback"],
    web_origins: ["https://example.com"],
    disable_sign_ups: false,
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

  // Add a test user
  await data.users.create("tenantId", {
    email: "foo@example.com",
    email_verified: true,
    name: "Test User",
    nickname: "Test User",
    picture: "https://example.com/test.png",
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
    API_URL: "http://localhost:3000",
    ENVIRONMENT: "test",
    JWKS_CACHE_TIMEOUT_IN_SECONDS: 3600,
    ORGANIZATION_NAME: "Test Organization",
    STRATEGIES: {
      "mock-strategy": mockStrategy,
    },
    SAML_SIGN_URL: "http://localhost:3000/saml/sign",
  };

  const apps = init({ dataAdapter: data });
  return {
    ...apps,
    env,
    getSentEmails: mockEmailService.getSentEmails.bind(mockEmailService),
    getSentSms: mockSmsService.getSentSms.bind(mockSmsService),
  };
}
