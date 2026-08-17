import { describe, expect, it, afterEach, afterAll } from "vitest";
import { decodeCursor } from "@authhero/adapter-interfaces";
import {
  getTestServer,
  clearTestData,
  teardownTestServer,
} from "./helpers/test-server";
import { decodeDynamoCursor, encodeDynamoCursor } from "../src/cursor";

const TENANT = "tenantId";

async function seedTenant(
  data: Awaited<ReturnType<typeof getTestServer>>["data"],
) {
  await data.tenants.create({
    id: TENANT,
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
}

describe("keyset pagination (from/take)", () => {
  // Clear rows between tests rather than recycling the dynalite server — the
  // helper documents this as the reliable path, and a per-test teardown here
  // intermittently raced the next test's table creation.
  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  it("walks every client exactly once across pages via next", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    for (let i = 0; i < 25; i++) {
      await data.clients.create(TENANT, {
        client_id: `client-${String(i).padStart(2, "0")}`,
        name: `Client ${i}`,
      });
    }

    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;

    do {
      const res = await data.clients.list(TENANT, { take: 10, from });
      pages++;
      for (const client of res.clients) {
        expect(seen.has(client.client_id)).toBe(false); // no duplicates
        seen.add(client.client_id);
      }
      from = res.totals?.next;
      expect(pages).toBeLessThan(10); // walk must terminate
    } while (from);

    expect(seen.size).toBe(25);
  });

  it("emits an opaque cursor that is not a numeric offset", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    for (let i = 0; i < 5; i++) {
      await data.clients.create(TENANT, {
        client_id: `client-${i}`,
        name: `Client ${i}`,
      });
    }

    const res = await data.clients.list(TENANT, { take: 2 });
    const next = res.totals?.next;

    expect(next).toBeTruthy();
    // The regression this guards: `from` used to be parseInt()'d as an offset.
    // An opaque token yields NaN there, which silently returned zero rows.
    expect(Number.isNaN(Number(next))).toBe(true);
    expect(
      decodeDynamoCursor(next!, {
        pk: `TENANT#${TENANT}`,
        skPrefix: "CLIENT#",
      }),
    ).toMatchObject({ PK: `TENANT#${TENANT}` });
  });

  it("returns rows — not an empty page — when handed back its own cursor", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    for (let i = 0; i < 6; i++) {
      await data.clients.create(TENANT, {
        client_id: `client-${i}`,
        name: `Client ${i}`,
      });
    }

    const first = await data.clients.list(TENANT, { take: 3 });
    expect(first.clients).toHaveLength(3);

    const second = await data.clients.list(TENANT, {
      take: 3,
      from: first.totals!.next,
    });
    expect(second.clients.length).toBeGreaterThan(0);

    const firstIds = first.clients.map((c) => c.client_id);
    for (const client of second.clients) {
      expect(firstIds).not.toContain(client.client_id);
    }
  });

  it("omits next on the final page", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    for (let i = 0; i < 3; i++) {
      await data.clients.create(TENANT, {
        client_id: `client-${i}`,
        name: `Client ${i}`,
      });
    }

    const res = await data.clients.list(TENANT, { take: 50 });
    expect(res.clients).toHaveLength(3);
    expect(res.totals?.next).toBeUndefined();
  });

  it("starts from the beginning on a malformed cursor instead of throwing", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    for (let i = 0; i < 4; i++) {
      await data.clients.create(TENANT, {
        client_id: `client-${i}`,
        name: `Client ${i}`,
      });
    }

    const res = await data.clients.list(TENANT, {
      take: 10,
      from: "not-a-valid-cursor",
    });
    expect(res.clients).toHaveLength(4);
  });

  it("keeps offset pagination working alongside keyset", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    for (let i = 0; i < 12; i++) {
      await data.clients.create(TENANT, {
        client_id: `client-${String(i).padStart(2, "0")}`,
        name: `Client ${i}`,
      });
    }

    const page0 = await data.clients.list(TENANT, {
      page: 0,
      per_page: 5,
      include_totals: true,
    });
    const page1 = await data.clients.list(TENANT, {
      page: 1,
      per_page: 5,
      include_totals: true,
    });

    expect(page0.clients).toHaveLength(5);
    expect(page1.clients).toHaveLength(5);
    expect(page0.totals?.start).toBe(0);
    expect(page1.totals?.start).toBe(5);
    // Offset mode reports no cursor.
    expect(page0.totals?.next).toBeUndefined();

    const ids0 = page0.clients.map((c) => c.client_id);
    for (const client of page1.clients) {
      expect(ids0).not.toContain(client.client_id);
    }
  });

  it("walks logs via next", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    for (let i = 0; i < 12; i++) {
      await data.logs.create(TENANT, {
        type: "s",
        date: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        description: `log ${i}`,
        isMobile: false,
      });
    }

    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;

    do {
      const res = await data.logs.list(TENANT, { take: 5, from });
      pages++;
      for (const log of res.logs) {
        expect(seen.has(log.log_id)).toBe(false);
        seen.add(log.log_id);
      }
      from = res.next;
      expect(pages).toBeLessThan(10);
    } while (from);

    expect(seen.size).toBe(12);
  });
});

describe("cursors from a different query", () => {
  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  // Every tenant-scoped entity shares the partition key TENANT#{id} and is
  // separated only by its sort-key prefix, so a cursor from one listing is
  // structurally valid for another. DynamoDB refuses such a key rather than
  // returning wrong rows — these assert we reject it first, so a bad `from`
  // restarts the walk instead of raising an unhandled ValidationException.

  it("ignores a cursor minted by another entity in the same tenant", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    for (let i = 0; i < 6; i++) {
      await data.clients.create(TENANT, {
        client_id: `client-${i}`,
        name: `C${i}`,
      });
      await data.clientGrants.create(TENANT, {
        client_id: `client-${i}`,
        audience: `https://api${i}.example.com`,
      });
    }

    const grants = await data.clientGrants.list(TENANT, { take: 2 });
    expect(grants.next).toBeTruthy();

    // Previously: ValidationException, "does not match the range key predicate".
    const clients = await data.clients.list(TENANT, {
      take: 10,
      from: grants.next,
    });
    expect(clients.clients).toHaveLength(6);
  });

  it("ignores a cursor minted for another tenant", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);
    await data.tenants.create({
      id: "other",
      friendly_name: "Other",
      audience: "https://other.example.com",
      sender_email: "o@example.com",
      sender_name: "O",
    });

    for (let i = 0; i < 4; i++) {
      await data.clients.create(TENANT, {
        client_id: `client-${i}`,
        name: `C${i}`,
      });
    }
    await data.clients.create("other", { client_id: "secret", name: "Secret" });
    await data.clients.create("other", { client_id: "secret-2", name: "S2" });

    const other = await data.clients.list("other", { take: 1 });
    expect(other.totals?.next).toBeTruthy();

    const mine = await data.clients.list(TENANT, {
      take: 10,
      from: other.totals?.next,
    });
    // Restarts in the caller's own tenant. DynamoDB would have refused the key
    // outright — this never had cross-tenant reach, it just failed loudly.
    expect(mine.clients).toHaveLength(4);
    expect(mine.clients.map((c) => c.client_id)).not.toContain("secret");
  });

  it("ignores a table cursor presented to a GSI-backed query", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);
    await data.clients.create(TENANT, { client_id: "client-0", name: "C0" });

    const clientCursor = (await data.clients.list(TENANT, { take: 1 })).totals
      ?.next;
    expect(clientCursor).toBeTruthy();

    // tenants.list queries GSI1; a table cursor lacks GSI1PK/GSI1SK.
    // Previously: ValidationException, "The provided starting key is invalid".
    const tenants = await data.tenants.list({ take: 10, from: clientCursor });
    expect(tenants.tenants.length).toBeGreaterThan(0);
  });
});

describe("dynamo cursor encoding", () => {
  const query = { pk: "TENANT#a", skPrefix: "CLIENT#" };

  it("round-trips a LastEvaluatedKey", () => {
    const key = { PK: "TENANT#a", SK: "CLIENT#b" };
    expect(decodeDynamoCursor(encodeDynamoCursor(key), query)).toEqual(key);
  });

  it("rejects malformed and foreign tokens rather than throwing", () => {
    expect(decodeDynamoCursor("!!!not-base64!!!", query)).toBeNull();
    expect(decodeDynamoCursor(encodeDynamoCursor({}), query)).toBeNull();
    // A cursor minted by a SQL adapter carries { s, i, k } and no PK — it must
    // not be forwarded to DynamoDB as an ExclusiveStartKey.
    const sqlCursor = "eyJzIjoiMjAyNC0wMS0wMSIsImkiOiJhYmMifQ";
    expect(decodeCursor(sqlCursor)).not.toBeNull();
    expect(decodeDynamoCursor(sqlCursor, query)).toBeNull();
  });

  it("rejects non-string key attributes", () => {
    expect(
      decodeDynamoCursor(encodeDynamoCursor({ PK: "TENANT#a", SK: 7 }), query),
    ).toBeNull();
    expect(
      decodeDynamoCursor(
        encodeDynamoCursor({ PK: "TENANT#a", SK: { nested: "x" } }),
        query,
      ),
    ).toBeNull();
  });

  it("rejects a mismatched partition key or sort-key prefix", () => {
    const key = { PK: "TENANT#a", SK: "CLIENT#b" };
    expect(
      decodeDynamoCursor(encodeDynamoCursor(key), { ...query, pk: "TENANT#z" }),
    ).toBeNull();
    expect(
      decodeDynamoCursor(encodeDynamoCursor(key), {
        ...query,
        skPrefix: "CLIENT_GRANT#",
      }),
    ).toBeNull();
  });

  it("compares against the index key pair for a GSI query", () => {
    const gsiQuery = { pk: "TENANTS", indexName: "GSI1", skPrefix: "TENANT#" };
    const gsiKey = {
      PK: "TENANT#a",
      SK: "TENANT",
      GSI1PK: "TENANTS",
      GSI1SK: "TENANT#a",
    };
    // The item's own PK differs from the query's pk — only the index pair is
    // compared, or every valid GSI cursor would be rejected.
    expect(decodeDynamoCursor(encodeDynamoCursor(gsiKey), gsiQuery)).toEqual(
      gsiKey,
    );
    // A table cursor has no GSI1PK/GSI1SK at all.
    expect(
      decodeDynamoCursor(
        encodeDynamoCursor({ PK: "TENANT#a", SK: "CLIENT#b" }),
        gsiQuery,
      ),
    ).toBeNull();
  });
});
