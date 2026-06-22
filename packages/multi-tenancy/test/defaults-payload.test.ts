import { describe, it, expect, beforeEach } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import { DataAdapters, SigningKey } from "@authhero/adapter-interfaces";
import {
  createEncryptedDataAdapter,
  createEncryptedDataAdapterWithKeyRing,
  loadEncryptionKey,
} from "authhero";
import {
  buildControlPlaneDefaultsPayload,
  applyControlPlaneDefaultsPayload,
} from "../src/rollout";

const CP = "cp";

function randomKey() {
  return loadEncryptionKey(
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
  );
}

async function makeDb() {
  const sqlite = new SQLite(":memory:");
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  await migrateToLatest(db, false);
  return { db, raw: createAdapters(db) as DataAdapters };
}

async function createTenant(raw: DataAdapters, id: string) {
  await raw.tenants.create({
    id,
    friendly_name: id,
    audience: "https://example.com",
    default_audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "Sender",
  });
}

function controlPlaneKey(kid: string): SigningKey {
  return {
    kid,
    // No tenant_id — control-plane scoped.
    type: "jwt_signing",
    cert: `-----PUBLIC ${kid}-----`,
    pkcs7: `-----PRIVATE ${kid}-----`,
    fingerprint: `fp-${kid}`,
    thumbprint: `tp-${kid}`,
  };
}

async function setup() {
  const cp = await makeDb();
  const tenant = await makeDb();

  const cpKey = await randomKey();
  const tenantKey = await randomKey();

  const cpData = createEncryptedDataAdapter(cp.raw, cpKey);
  const tenantData = createEncryptedDataAdapterWithKeyRing(
    tenant.raw,
    { default: tenantKey, keys: { cp: cpKey } },
    { resolveEncryptKeyId: (tenantId) => (tenantId === CP ? "cp" : undefined) },
  );

  await createTenant(cp.raw, CP);
  await createTenant(cp.raw, "t1"); // target tenant — its row lives on the CP DB
  // NB: the tenant DB starts with NO tenants rows (mirrors a freshly migrated
  // WFP D1). The apply path is responsible for seeding the FK-target rows.

  // Seed control plane defaults.
  await cpData.connections.create(CP, {
    id: "google",
    name: "google",
    strategy: "google-oauth2",
    options: { client_id: "public-id", client_secret: "our-google-secret" },
  });
  await cpData.resourceServers.create(CP, {
    id: "rs-sys",
    name: "System API",
    identifier: "https://system.example.com",
    is_system: true,
    scopes: [{ value: "read:system" }],
  });
  await cpData.resourceServers.create(CP, {
    id: "rs-user",
    name: "User API",
    identifier: "https://user.example.com",
    is_system: false,
  });
  await cpData.hooks.create(CP, {
    trigger_id: "post-user-login",
    url: "https://hooks.example.com/inheritable",
    enabled: true,
    metadata: { inheritable: true },
  });
  await cpData.hooks.create(CP, {
    trigger_id: "post-user-login",
    url: "https://hooks.example.com/private",
    enabled: true,
  });

  // Two control-plane signing keys (private material present).
  await cpData.keys.create(controlPlaneKey("kid-1"));
  await cpData.keys.create(controlPlaneKey("kid-2"));

  return { cp, tenant, cpData, tenantData, tenantKey };
}

describe("buildControlPlaneDefaultsPayload", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("includes connections and only the inheritable / system entities", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP);

    expect(payload.connections.map((c) => c.id)).toEqual(["google"]);
    expect(payload.resourceServers.map((r) => r.id)).toEqual(["rs-sys"]);
    expect(payload.hooks).toHaveLength(1);
    expect(payload.hooks[0]?.url).toBe("https://hooks.example.com/inheritable");
  });

  it("carries signing keys as PUBLIC material only — pkcs7 stripped, no tenant_id", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP);

    expect(payload.signingKeys.map((k) => k.kid).sort()).toEqual([
      "kid-1",
      "kid-2",
    ]);
    for (const key of payload.signingKeys) {
      expect(key.pkcs7).toBeUndefined();
      expect(key.tenant_id).toBeUndefined();
      expect(key.cert).toContain("PUBLIC");
    }
  });

  it("can opt out of signing keys", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP, {
      signingKeys: false,
    });
    expect(payload.signingKeys).toEqual([]);
  });

  it("carries the control-plane tenant seed by default", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP);
    expect(payload.tenants).toEqual([{ id: CP, friendly_name: CP }]);
  });

  it("also carries the target tenant seed when given a target id", async () => {
    const payload = await buildControlPlaneDefaultsPayload(
      ctx.cpData,
      CP,
      {},
      "t1",
    );
    expect(payload.tenants).toEqual([
      { id: CP, friendly_name: CP },
      { id: "t1", friendly_name: "t1" },
    ]);
  });

  it("does not duplicate the seed when the target id is the control plane", async () => {
    const payload = await buildControlPlaneDefaultsPayload(
      ctx.cpData,
      CP,
      {},
      CP,
    );
    expect(payload.tenants).toEqual([{ id: CP, friendly_name: CP }]);
  });

  it("can opt out of tenant seeds", async () => {
    const payload = await buildControlPlaneDefaultsPayload(
      ctx.cpData,
      CP,
      { tenants: false },
      "t1",
    );
    expect(payload.tenants).toEqual([]);
  });
});

describe("applyControlPlaneDefaultsPayload", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("seeds the FK-target tenant rows before the keyed defaults", async () => {
    // The tenant DB starts with no tenants rows (fresh WFP D1).
    expect(await ctx.tenant.raw.tenants.get(CP)).toBeNull();
    expect(await ctx.tenant.raw.tenants.get("t1")).toBeNull();

    const payload = await buildControlPlaneDefaultsPayload(
      ctx.cpData,
      CP,
      {},
      "t1",
    );
    const result = await applyControlPlaneDefaultsPayload(
      payload,
      ctx.tenantData,
      CP,
    );

    expect(result.tenants.upserted).toBe(2);
    expect((await ctx.tenant.raw.tenants.get(CP))?.friendly_name).toBe(CP);
    expect((await ctx.tenant.raw.tenants.get("t1"))?.friendly_name).toBe("t1");
    // The defaults keyed under the control-plane tenant were written too — i.e.
    // their tenant_id FK resolved against the seeded row.
    expect(result.connections.upserted).toBe(1);
    expect(await ctx.tenant.raw.connections.get(CP, "google")).not.toBeNull();
  });

  it("is idempotent — tenant seeds are create-if-missing, never clobbered", async () => {
    const payload = await buildControlPlaneDefaultsPayload(
      ctx.cpData,
      CP,
      {},
      "t1",
    );
    await applyControlPlaneDefaultsPayload(payload, ctx.tenantData, CP);

    // A tenant edits its own row between syncs.
    await ctx.tenant.raw.tenants.update("t1", { friendly_name: "Renamed" });

    const second = await applyControlPlaneDefaultsPayload(
      payload,
      ctx.tenantData,
      CP,
    );

    // Both rows already exist → nothing re-created, the local edit survives.
    expect(second.tenants.upserted).toBe(0);
    expect((await ctx.tenant.raw.tenants.get("t1"))?.friendly_name).toBe(
      "Renamed",
    );
  });

  it("without tenant seeding the keyed defaults FK-fail (the #972 bug)", async () => {
    const payload = await buildControlPlaneDefaultsPayload(
      ctx.cpData,
      CP,
      {},
      "t1",
    );
    // Opt out of seeding → the control-plane tenant row is never created, so
    // the connection keyed under CP violates the tenant_id FK, just as a
    // freshly provisioned WFP D1 did before the seed was added.
    await expect(
      applyControlPlaneDefaultsPayload(payload, ctx.tenantData, CP, {
        entities: { tenants: false },
      }),
    ).rejects.toThrow(/FOREIGN KEY/i);
    expect(await ctx.tenant.raw.tenants.get(CP)).toBeNull();
  });

  it("writes the defaults under the control-plane tenant id", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP);
    const result = await applyControlPlaneDefaultsPayload(
      payload,
      ctx.tenantData,
      CP,
    );

    expect(result.connections.upserted).toBe(1);
    expect(result.resourceServers.upserted).toBe(1);
    expect(result.hooks.upserted).toBe(1);

    const connection = await ctx.tenantData.connections.get(CP, "google");
    expect(connection?.options.client_secret).toBe("our-google-secret");
    expect(await ctx.tenantData.resourceServers.get(CP, "rs-sys")).not.toBeNull();
    expect(await ctx.tenantData.resourceServers.get(CP, "rs-user")).toBeNull();
  });

  it("encrypts the inherited secret under the control-plane key id at rest", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP);
    await applyControlPlaneDefaultsPayload(payload, ctx.tenantData, CP);

    const rawRow = await ctx.tenant.db
      .selectFrom("connections")
      .select("options")
      .where("id", "=", "google")
      .where("tenant_id", "=", CP)
      .executeTakeFirst();
    const options = String(rawRow?.options);
    expect(options).toContain("enc:v1:cp:");
    expect(options).not.toContain("our-google-secret");
  });

  it("upserts public signing keys with no tenant_id and never the private key", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP);
    const result = await applyControlPlaneDefaultsPayload(
      payload,
      ctx.tenantData,
      CP,
    );

    expect(result.signingKeys.upserted).toBe(2);

    const rows = await ctx.tenant.db
      .selectFrom("keys")
      .selectAll()
      .where("type", "=", "jwt_signing")
      .execute();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.tenant_id ?? null).toBeNull();
      expect(row.pkcs7 ?? null).toBeNull();
    }
  });

  it("is idempotent — signing keys are create-if-missing by kid", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP);
    await applyControlPlaneDefaultsPayload(payload, ctx.tenantData, CP);
    const second = await applyControlPlaneDefaultsPayload(
      payload,
      ctx.tenantData,
      CP,
    );

    // Second apply finds both kids already present and creates nothing.
    expect(second.signingKeys.upserted).toBe(0);

    const rows = await ctx.tenant.db
      .selectFrom("keys")
      .select("kid")
      .execute();
    expect(rows).toHaveLength(2);
  });

  it("strips pkcs7 defensively even if a payload smuggles a private key", async () => {
    const payload = await buildControlPlaneDefaultsPayload(ctx.cpData, CP);
    // Simulate a tampered/over-shared payload carrying private material.
    payload.signingKeys = payload.signingKeys.map((k) => ({
      ...k,
      pkcs7: "-----PRIVATE leaked-----",
    }));

    await applyControlPlaneDefaultsPayload(payload, ctx.tenantData, CP);

    const rows = await ctx.tenant.db
      .selectFrom("keys")
      .select("pkcs7")
      .execute();
    for (const row of rows) {
      expect(row.pkcs7 ?? null).toBeNull();
    }
  });
});
