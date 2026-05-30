import { describe, it, expect, beforeEach } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { base64 } from "oslo/encoding";
import { createEncryptedDataAdapter, loadEncryptionKey } from "../../src";

const ENC_PREFIX = "enc:v1:";

async function setup() {
  const sqlite = new SQLite(":memory:");
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  await migrateToLatest(db, false);

  const raw: DataAdapters = createAdapters(db);
  const key = await loadEncryptionKey(
    base64.encode(crypto.getRandomValues(new Uint8Array(32))),
  );
  const data = createEncryptedDataAdapter(raw, key);

  await raw.tenants.create({
    id: "t1",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    default_audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "Sender",
  });

  return { db, raw, data };
}

describe("createEncryptedDataAdapter", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("encrypts client_secret at rest but returns plaintext to callers", async () => {
    const created = await ctx.data.clients.create("t1", {
      client_id: "c1",
      client_secret: "topsecret",
      name: "Client 1",
    });
    expect(created.client_secret).toBe("topsecret");

    const rawRow = await ctx.db
      .selectFrom("clients")
      .select("client_secret")
      .where("client_id", "=", "c1")
      .executeTakeFirst();
    expect(rawRow?.client_secret).toMatch(/^enc:v1:/);
    expect(rawRow?.client_secret).not.toContain("topsecret");

    const fetched = await ctx.data.clients.get("t1", "c1");
    expect(fetched?.client_secret).toBe("topsecret");

    const byClientId = await ctx.data.clients.getByClientId("c1");
    expect(byClientId?.client_secret).toBe("topsecret");

    const listed = await ctx.data.clients.list("t1");
    expect(listed.clients[0]?.client_secret).toBe("topsecret");
  });

  it("encrypts sensitive keys inside connection options", async () => {
    await ctx.data.connections.create("t1", {
      id: "conn1",
      name: "Google",
      strategy: "google-oauth2",
      options: {
        client_id: "public-id",
        client_secret: "shh",
        configuration: { client_secret: "nested-shh" },
      },
    });

    const rawRow = await ctx.db
      .selectFrom("connections")
      .select("options")
      .where("id", "=", "conn1")
      .executeTakeFirst();
    const rawOptions = String(rawRow?.options);
    expect(rawOptions).not.toContain("shh");
    expect(rawOptions).toContain(ENC_PREFIX);
    // Non-sensitive keys stay readable.
    expect(rawOptions).toContain("public-id");

    const fetched = await ctx.data.connections.get("t1", "conn1");
    expect(fetched?.options.client_secret).toBe("shh");
    expect(fetched?.options.client_id).toBe("public-id");
    expect(fetched?.options.configuration?.client_secret).toBe("nested-shh");
  });

  it("encrypts email provider credentials", async () => {
    await ctx.data.emailProviders.create("t1", {
      name: "ses",
      enabled: true,
      credentials: { api_key: "key-123", region: "eu-west-1" },
    });

    const rawRow = await ctx.db
      .selectFrom("email_providers")
      .select("credentials")
      .where("tenant_id", "=", "t1")
      .executeTakeFirst();
    expect(String(rawRow?.credentials)).not.toContain("key-123");
    expect(String(rawRow?.credentials)).toContain(ENC_PREFIX);

    const fetched = await ctx.data.emailProviders.get("t1");
    expect(fetched?.credentials.api_key).toBe("key-123");
    expect(fetched?.credentials.region).toBe("eu-west-1");
  });

  it("reads legacy plaintext rows and migrates them to ciphertext on write", async () => {
    // Write directly through the unwrapped adapter → plaintext at rest.
    await ctx.raw.clients.create("t1", {
      client_id: "legacy",
      client_secret: "plain-legacy",
      name: "Legacy",
    });

    const before = await ctx.db
      .selectFrom("clients")
      .select("client_secret")
      .where("client_id", "=", "legacy")
      .executeTakeFirst();
    expect(before?.client_secret).toBe("plain-legacy");

    // The wrapper still returns it correctly (prefix-aware passthrough).
    const fetched = await ctx.data.clients.get("t1", "legacy");
    expect(fetched?.client_secret).toBe("plain-legacy");

    // Writing the secret through the wrapper encrypts it.
    await ctx.data.clients.update("t1", "legacy", {
      client_secret: "plain-legacy",
    });
    const after = await ctx.db
      .selectFrom("clients")
      .select("client_secret")
      .where("client_id", "=", "legacy")
      .executeTakeFirst();
    expect(after?.client_secret).toMatch(/^enc:v1:/);

    expect((await ctx.data.clients.get("t1", "legacy"))?.client_secret).toBe(
      "plain-legacy",
    );
  });

  it("does not double-encrypt an already-encrypted value", async () => {
    await ctx.data.clients.create("t1", {
      client_id: "c2",
      client_secret: "secret2",
      name: "Client 2",
    });
    const enc = await ctx.db
      .selectFrom("clients")
      .select("client_secret")
      .where("client_id", "=", "c2")
      .executeTakeFirst();

    // Feed the stored ciphertext back through update; it must not be wrapped again.
    await ctx.data.clients.update("t1", "c2", {
      client_secret: enc?.client_secret,
    });
    const after = await ctx.db
      .selectFrom("clients")
      .select("client_secret")
      .where("client_id", "=", "c2")
      .executeTakeFirst();
    expect(after?.client_secret).toBe(enc?.client_secret);
    expect((await ctx.data.clients.get("t1", "c2"))?.client_secret).toBe(
      "secret2",
    );
  });

  it("encrypts totp_secret at rest and round-trips through every read", async () => {
    const created = await ctx.data.authenticationMethods.create("t1", {
      user_id: "user1",
      type: "totp",
      totp_secret: "BASE32SECRET",
      confirmed: true,
    });
    expect(created.totp_secret).toBe("BASE32SECRET");

    const raw = await ctx.db
      .selectFrom("authentication_methods")
      .select("totp_secret")
      .where("id", "=", created.id)
      .executeTakeFirst();
    expect(raw?.totp_secret).toMatch(/^enc:v1:/);
    expect(String(raw?.totp_secret)).not.toContain("BASE32SECRET");

    expect(
      (await ctx.data.authenticationMethods.get("t1", created.id))?.totp_secret,
    ).toBe("BASE32SECRET");

    const list = await ctx.data.authenticationMethods.list("t1", "user1");
    expect(list[0]?.totp_secret).toBe("BASE32SECRET");

    const updated = await ctx.data.authenticationMethods.update(
      "t1",
      created.id,
      { totp_secret: "NEWSECRET" },
    );
    expect(updated.totp_secret).toBe("NEWSECRET");
    const rawAfter = await ctx.db
      .selectFrom("authentication_methods")
      .select("totp_secret")
      .where("id", "=", created.id)
      .executeTakeFirst();
    expect(rawAfter?.totp_secret).toMatch(/^enc:v1:/);
    expect(String(rawAfter?.totp_secret)).not.toContain("NEWSECRET");
  });

  it("encrypts migration source client_secret while leaving non-secret keys readable", async () => {
    const migrationSources = ctx.data.migrationSources;
    if (!migrationSources) throw new Error("migrationSources adapter missing");

    const created = await migrationSources.create("t1", {
      name: "Upstream",
      provider: "auth0",
      connection: "auth0",
      enabled: true,
      credentials: {
        domain: "t.auth0.com",
        client_id: "upstream-cid",
        client_secret: "msecret",
      },
    });
    expect(created.credentials.client_secret).toBe("msecret");

    const raw = await ctx.db
      .selectFrom("migration_sources")
      .select("credentials")
      .where("id", "=", created.id)
      .executeTakeFirst();
    expect(String(raw?.credentials)).not.toContain("msecret");
    expect(String(raw?.credentials)).toContain(ENC_PREFIX);
    expect(String(raw?.credentials)).toContain("upstream-cid");

    expect(
      (await migrationSources.get("t1", created.id))?.credentials.client_secret,
    ).toBe("msecret");
    const list = await migrationSources.list("t1");
    expect(list[0]?.credentials.client_secret).toBe("msecret");
  });

  it("encrypts connection options on update and decrypts on list", async () => {
    await ctx.data.connections.create("t1", {
      id: "c-up",
      name: "Upstream",
      strategy: "oauth2",
      options: { client_secret: "old" },
    });
    await ctx.data.connections.update("t1", "c-up", {
      options: { client_secret: "new" },
    });

    const raw = await ctx.db
      .selectFrom("connections")
      .select("options")
      .where("id", "=", "c-up")
      .executeTakeFirst();
    expect(String(raw?.options)).not.toContain("new");
    expect(String(raw?.options)).toContain(ENC_PREFIX);

    const list = await ctx.data.connections.list("t1");
    const found = list.connections.find((c) => c.id === "c-up");
    expect(found?.options.client_secret).toBe("new");
  });

  it("encrypts email provider credentials on update", async () => {
    await ctx.data.emailProviders.create("t1", {
      name: "ses",
      enabled: true,
      credentials: { api_key: "k1" },
    });
    await ctx.data.emailProviders.update("t1", {
      credentials: { api_key: "k2" },
    });

    const raw = await ctx.db
      .selectFrom("email_providers")
      .select("credentials")
      .where("tenant_id", "=", "t1")
      .executeTakeFirst();
    expect(String(raw?.credentials)).not.toContain("k2");
    expect(String(raw?.credentials)).toContain(ENC_PREFIX);
    expect((await ctx.data.emailProviders.get("t1"))?.credentials.api_key).toBe(
      "k2",
    );
  });

  it("encrypts writes performed inside a transaction", async () => {
    await ctx.data.transaction(async (trx) => {
      await trx.clients.create("t1", {
        client_id: "txc",
        client_secret: "txsecret",
        name: "Tx Client",
      });
    });

    const raw = await ctx.db
      .selectFrom("clients")
      .select("client_secret")
      .where("client_id", "=", "txc")
      .executeTakeFirst();
    expect(raw?.client_secret).toMatch(/^enc:v1:/);
    expect((await ctx.data.clients.get("t1", "txc"))?.client_secret).toBe(
      "txsecret",
    );
  });

  it("does not corrupt an encrypted secret when updating an unrelated field", async () => {
    await ctx.data.clients.create("t1", {
      client_id: "keep",
      client_secret: "keepsecret",
      name: "Keep",
    });
    await ctx.data.clients.update("t1", "keep", { name: "Renamed" });

    const raw = await ctx.db
      .selectFrom("clients")
      .select(["client_secret", "name"])
      .where("client_id", "=", "keep")
      .executeTakeFirst();
    expect(raw?.name).toBe("Renamed");
    expect(raw?.client_secret).toMatch(/^enc:v1:/);
    expect((await ctx.data.clients.get("t1", "keep"))?.client_secret).toBe(
      "keepsecret",
    );
  });

  it("handles a client created without a secret without throwing", async () => {
    const created = await ctx.data.clients.create("t1", {
      client_id: "nosecret",
      name: "No Secret",
    });
    expect(
      created.client_secret == null ||
        typeof created.client_secret === "string",
    ).toBe(true);
    expect(await ctx.data.clients.get("t1", "nosecret")).toBeTruthy();
  });

  it("decrypts connection options returned by clientConnections.listByClient", async () => {
    await ctx.data.connections.create("t1", {
      id: "google",
      name: "google-oauth2",
      strategy: "google-oauth2",
      options: {
        client_id: "google-cid",
        client_secret: "google-shh",
      },
    });

    await ctx.data.clients.create("t1", {
      client_id: "app",
      name: "App",
    });
    await ctx.data.clientConnections.updateByClient("t1", "app", ["google"]);

    const raw = await ctx.db
      .selectFrom("connections")
      .select("options")
      .where("id", "=", "google")
      .executeTakeFirst();
    expect(String(raw?.options)).toContain(ENC_PREFIX);
    expect(String(raw?.options)).not.toContain("google-shh");

    const connections = await ctx.data.clientConnections.listByClient(
      "t1",
      "app",
    );
    expect(connections).toHaveLength(1);
    expect(connections[0].options.client_secret).toBe("google-shh");
    expect(connections[0].options.client_id).toBe("google-cid");
  });

  it("leaves non-string credential values untouched", async () => {
    await ctx.data.emailProviders.create("t1", {
      name: "smtp",
      enabled: true,
      credentials: { api_key: "secret", port: 587, secure: true },
    });

    const got = await ctx.data.emailProviders.get("t1");
    expect(got?.credentials.api_key).toBe("secret");
    expect(got?.credentials.port).toBe(587);
    expect(got?.credentials.secure).toBe(true);
  });
});
