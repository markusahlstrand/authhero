import { describe, it, expect, beforeEach } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import { DataAdapters } from "@authhero/adapter-interfaces";
import {
  createEncryptedDataAdapter,
  createEncryptedDataAdapterWithKeyRing,
  loadEncryptionKey,
} from "authhero";
import { projectControlPlaneDefaults } from "../src/rollout";

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

async function setup() {
  // Control plane database (shared PlanetScale stand-in).
  const cp = await makeDb();
  // WFP tenant database (the tenant's own D1 stand-in).
  const tenant = await makeDb();

  const cpKey = await randomKey();
  const tenantKey = await randomKey();

  // Control plane reads/writes its own secrets under a single key.
  const cpData = createEncryptedDataAdapter(cp.raw, cpKey);

  // The tenant DB holds its own rows under the tenant key, but control-plane
  // tenant rows are encrypted under a control-plane-only key id ("cp").
  const tenantData = createEncryptedDataAdapterWithKeyRing(
    tenant.raw,
    { default: tenantKey, keys: { cp: cpKey } },
    { resolveEncryptKeyId: (tenantId) => (tenantId === CP ? "cp" : undefined) },
  );

  await createTenant(cp.raw, CP);
  await createTenant(tenant.raw, CP); // projected control-plane tenant
  await createTenant(tenant.raw, "t1"); // the tenant itself

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

  const config = {
    controlPlaneTenantId: CP,
    getControlPlaneAdapters: async () => cpData,
    getAdapters: async () => tenantData,
  };

  return { cp, tenant, cpData, tenantData, tenantKey, config };
}

describe("projectControlPlaneDefaults", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("copies control plane connections into the tenant DB under the control plane tenant id", async () => {
    const result = await projectControlPlaneDefaults(ctx.config, "t1");
    expect(result.connections.upserted).toBe(1);

    const projected = await ctx.tenantData.connections.get(CP, "google");
    expect(projected?.strategy).toBe("google-oauth2");
    expect(projected?.options.client_secret).toBe("our-google-secret");
  });

  it("encrypts the inherited secret under the control-plane key id at rest", async () => {
    await projectControlPlaneDefaults(ctx.config, "t1");

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

  it("a tenant key ring without the control-plane key cannot read the inherited secret", async () => {
    await projectControlPlaneDefaults(ctx.config, "t1");

    // The tenant operator only holds their own key — no "cp" key.
    const tenantOnly = createEncryptedDataAdapterWithKeyRing(ctx.tenant.raw, {
      default: ctx.tenantKey,
    });
    await expect(tenantOnly.connections.get(CP, "google")).rejects.toThrow(
      /No key for id "cp"/,
    );
  });

  it("projects only is_system resource servers", async () => {
    const result = await projectControlPlaneDefaults(ctx.config, "t1");
    expect(result.resourceServers.upserted).toBe(1);

    expect(
      await ctx.tenantData.resourceServers.get(CP, "rs-sys"),
    ).not.toBeNull();
    expect(await ctx.tenantData.resourceServers.get(CP, "rs-user")).toBeNull();
  });

  it("is idempotent — re-running converges instead of duplicating", async () => {
    await projectControlPlaneDefaults(ctx.config, "t1");
    await projectControlPlaneDefaults(ctx.config, "t1");

    const list = await ctx.tenantData.connections.list(CP);
    expect(list.connections.filter((c) => c.id === "google")).toHaveLength(1);
  });

  it("reflects later control plane edits on re-sync", async () => {
    await projectControlPlaneDefaults(ctx.config, "t1");

    await ctx.cpData.connections.update(CP, "google", {
      options: { client_id: "public-id", client_secret: "rotated-secret" },
    });
    await projectControlPlaneDefaults(ctx.config, "t1");

    const projected = await ctx.tenantData.connections.get(CP, "google");
    expect(projected?.options.client_secret).toBe("rotated-secret");
  });
});
