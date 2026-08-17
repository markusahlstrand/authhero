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
    expect(decodeDynamoCursor(next!)).toMatchObject({ PK: expect.any(String) });
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

describe("dynamo cursor encoding", () => {
  it("round-trips a LastEvaluatedKey", () => {
    const key = { PK: "TENANT#a", SK: "CLIENT#b" };
    expect(decodeDynamoCursor(encodeDynamoCursor(key))).toEqual(key);
  });

  it("rejects malformed and foreign tokens rather than throwing", () => {
    expect(decodeDynamoCursor("!!!not-base64!!!")).toBeNull();
    expect(decodeDynamoCursor(encodeDynamoCursor({}))).toBeNull();
    // A cursor minted by a SQL adapter carries { s, i, k } and no PK — it must
    // not be forwarded to DynamoDB as an ExclusiveStartKey.
    const sqlCursor = "eyJzIjoiMjAyNC0wMS0wMSIsImkiOiJhYmMifQ";
    expect(decodeCursor(sqlCursor)).not.toBeNull();
    expect(decodeDynamoCursor(sqlCursor)).toBeNull();
  });
});
