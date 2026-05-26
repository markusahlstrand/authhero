import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { createKyselyProxyDataAdapter } from "../src/kysely";
import { runMigrations } from "../src/migrate";
import { ProxyDatabase } from "../src/kysely/schema";

describe("kysely proxy data adapter (sqlite)", () => {
  let db: Kysely<ProxyDatabase>;

  beforeAll(async () => {
    db = new Kysely<ProxyDatabase>({
      dialect: new SqliteDialect({ database: new Database(":memory:") }),
    });

    // Stand up a minimal `custom_domains` table; in production this is owned
    // by authhero's migrations. The proxy's migrator only owns `proxy_routes`.
    await db.schema
      .createTable("custom_domains")
      .addColumn("custom_domain_id", "varchar(256)", (col) =>
        col.notNull().primaryKey(),
      )
      .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
      .addColumn("domain", "varchar(255)", (col) => col.notNull())
      .execute();

    await runMigrations(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("creates, lists and resolves routes", async () => {
    await db
      .insertInto("custom_domains")
      .values({
        custom_domain_id: "cd1",
        tenant_id: "t1",
        domain: "customer.com",
      })
      .execute();

    const adapter = createKyselyProxyDataAdapter(db);

    await adapter.proxyRoutes.create("t1", {
      custom_domain_id: "cd1",
      priority: 100,
      path_pattern: "/",
      upstream_type: "http",
      upstream_url: "https://account.vercel.app",
      preserve_host: false,
      middleware: [{ type: "cors", origins: ["*"] }],
    });

    await adapter.proxyRoutes.create("t1", {
      custom_domain_id: "cd1",
      priority: 50,
      path_pattern: "/checkout/*",
      upstream_type: "http",
      upstream_url: "https://checkout.vercel.app",
      preserve_host: false,
      middleware: [],
    });

    const list = await adapter.proxyRoutes.list("t1");
    expect(list.length).toBe(2);

    const resolved = await adapter.resolveHost("customer.com");
    expect(resolved?.tenant_id).toBe("t1");
    expect(resolved?.routes.length).toBe(2);
    // ordered by priority ascending
    expect(resolved?.routes[0]?.path_pattern).toBe("/checkout/*");
    expect(resolved?.routes[1]?.path_pattern).toBe("/");

    const corsRoute = resolved?.routes[1];
    expect(corsRoute?.middleware[0]?.type).toBe("cors");
  });

  it("returns null for unknown host", async () => {
    const adapter = createKyselyProxyDataAdapter(db);
    expect(await adapter.resolveHost("nope.example")).toBeNull();
  });
});
