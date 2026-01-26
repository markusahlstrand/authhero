import { Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-sqlite";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import bcryptjs from "bcryptjs";
// @ts-ignore
import * as bunSqlite from "bun:sqlite";

import createApp from "./app";
import { createX509Certificate } from "./helpers/encryption";
import { SendEmailParams } from "authhero";

const dialect = new BunSqliteDialect({
  database: new bunSqlite.Database("db.sqlite"),
});
const db = new Kysely<Database>({
  dialect,
});

// Run the migrations
await migrateToLatest(db);

const dataAdapter = createAdapters(db);

const app = createApp({
  dataAdapter,
  allowedOrigins: ["http://localhost:5173", "https://local.authhe.ro"],
});

const { signingKeys } = await dataAdapter.keys.list({ q: "type:jwt_signing" });

if (signingKeys.length === 0) {
  const signingKey = await createX509Certificate({
    name: `CN=demo`,
  });
  await dataAdapter.keys.create(signingKey);

  await dataAdapter.tenants.create({
    id: "main",
    name: "Main Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  await dataAdapter.clients.create("main", {
    client_id: "default",
    client_secret: "clientSecret",
    name: "Default Client",
    callbacks: ["http://localhost:5173/auth-callback"],
    allowed_logout_urls: ["http://localhost:5173/callback"],
    web_origins: ["https://localhost:5173"],
  });

  // OpenID Conformance Suite test clients
  await dataAdapter.clients.create("main", {
    client_id: "conformance-test",
    client_secret: "conformanceTestSecret123",
    name: "Conformance Test Client",
    callbacks: [
      "https://localhost.emobix.co.uk:8443/test/a/authhero-local/callback",
      "https://localhost:8443/test/a/authhero-local/callback",
    ],
    allowed_logout_urls: [
      "https://localhost:8443/",
      "https://localhost.emobix.co.uk:8443/",
    ],
    web_origins: [
      "https://localhost:8443",
      "https://localhost.emobix.co.uk:8443",
    ],
  });

  await dataAdapter.clients.create("main", {
    client_id: "conformance-test2",
    client_secret: "conformanceTestSecret456",
    name: "Conformance Test Client 2",
    callbacks: [
      "https://localhost.emobix.co.uk:8443/test/a/authhero-local/callback",
      "https://localhost:8443/test/a/authhero-local/callback",
    ],
    allowed_logout_urls: [
      "https://localhost:8443/",
      "https://localhost.emobix.co.uk:8443/",
    ],
    web_origins: [
      "https://localhost:8443",
      "https://localhost.emobix.co.uk:8443",
    ],
  });

  await dataAdapter.emailProviders.create("main", {
    name: "mock-email",
    enabled: true,
    credentials: {
      api_key: "your_api_key_here",
    },
  });

  await dataAdapter.connections.create("main", {
    strategy: "email",
    name: "Email",
    options: {},
  });

  await dataAdapter.connections.create("main", {
    strategy: "Username-Password-Authentication",
    name: "Username-Password",
    options: {},
  });

  await dataAdapter.users.create("main", {
    email: "admin@example.com",
    email_verified: true,
    name: "Test User",
    nickname: "Test User",
    picture: "https://example.com/test.png",
    connection: "Username-Password-Authentication",
    provider: "Username-Password",
    is_social: false,
    user_id: "authhero|admin",
  });

  await dataAdapter.passwords.create("main", {
    user_id: "authhero|admin",
    password: await bcryptjs.hash("admin", 10),
    algorithm: "bcrypt",
  });

  console.log("Initiated database");
}

const server = {
  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, {
      // @ts-ignore
      // ...process.env,
      ISSUER: "http://localhost:3000/",
      emailProviders: {
        "mock-email": async (params: SendEmailParams) => {
          console.log("Sending email", params);
        },
      },
      data: dataAdapter,
    });
  },
};

export default server;
