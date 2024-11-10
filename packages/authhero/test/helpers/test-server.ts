import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import { DataAdapters } from "@authhero/adapter-interfaces";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import { init } from "../../src";
import { getCertificate } from "./token";
import { Tenant } from "@authhero/kysely-adapter";

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

  const env = {
    data,
  };

  const apps = init({ dataAdapter: data, issuer: "https://example.com/" });
  return {
    ...apps,
    env,
  };
}
