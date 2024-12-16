import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { DataAdapters } from "@authhero/adapter-interfaces";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import * as x509 from "@peculiar/x509";
import { init } from "../../src";
import { getCertificate } from "./token";
import { Tenant } from "@authhero/kysely-adapter";
import { Bindings } from "../../src/types";
import { MockEmailService } from "./mock-email-service";

type getEnvParams = {
  testTenantLanguage?: string;
  emailValidation?: "enabled" | "enforced" | "disabled";
};

export async function getTestServer(args: getEnvParams = {}) {
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
  const tenant: Tenant = {
    id: "tenantId",
    name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
    support_url: "https://example.com/support",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    language: args.testTenantLanguage,
  };

  await data.tenants.create(tenant);

  // Add a client
  await data.applications.create("tenantId", {
    id: "clientId",
    client_secret: "clientSecret",
    name: "Test Client",
    callbacks: ["https://example/callback"],
    allowed_logout_urls: ["https://example/callback"],
    disable_sign_ups: false,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    login_count: 0,
  });

  const certificate = new x509.X509Certificate(signingKey.cert);
  const publicKey = await certificate.publicKey.export();
  const jwkKey = await crypto.subtle.exportKey("jwk", publicKey);
  const mockEmailService = new MockEmailService();

  const env: Bindings = {
    data,
    emailProviders: {
      "mock-email": mockEmailService.sendEmail.bind(mockEmailService),
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
    ISSUER: "http://localhost:3000",
    ENVIRONMENT: "test",
    JWKS_CACHE_TIMEOUT_IN_SECONDS: 3600,
    ORGANIZATION_NAME: "Test Organization",
  };

  const apps = init({ dataAdapter: data });
  return {
    ...apps,
    env,
    getSentEmails: mockEmailService.getSentEmails.bind(mockEmailService),
  };
}
