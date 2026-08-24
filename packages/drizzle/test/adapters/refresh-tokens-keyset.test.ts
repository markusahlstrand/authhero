import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

// Checkpoint (from/take) pagination for refresh tokens, backing Auth0's
// GET /users/{user_id}/refresh-tokens. Fixed created_at desc order with an id
// tiebreaker, and no offset envelope.
describe("refreshTokens keyset pagination (from/take)", () => {
  let data: ReturnType<typeof getTestServer>["data"];
  const tenantId = "t1";

  function device() {
    return {
      last_ip: "",
      initial_ip: "",
      last_user_agent: "",
      initial_user_agent: "",
      initial_asn: "",
      last_asn: "",
    };
  }

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;

    await data.tenants.create({ id: tenantId, name: "Tenant 1" });

    // created_at_ts is stamped from Date.now() by the adapter. Freeze time and
    // step it so rows share timestamps in pairs — that is where the id
    // tiebreaker has to carry the ordering.
    const base = Date.now();
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(base + Math.floor(i / 2) * 1000);
      await data.refreshTokens.create(tenantId, {
        id: `rt-${i.toString().padStart(2, "0")}`,
        login_id: "ls1",
        user_id: i % 2 === 0 ? "user-even" : "user-odd",
        client_id: "clientA",
        device: device(),
        resource_servers: [],
        rotating: false,
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("walks every row exactly once in created_at desc order", async () => {
    const seen: string[] = [];
    let from: string | undefined;
    let pages = 0;

    for (;;) {
      const res = await data.refreshTokens.list(tenantId, { take: 4, from });
      pages++;
      for (const rt of res.refresh_tokens) {
        expect(seen.includes(rt.id)).toBe(false);
        seen.push(rt.id);
      }
      if (!res.next) break;
      from = res.next;
      if (pages > 10) throw new Error("cursor walk did not terminate");
    }

    expect(seen.length).toBe(10);
    expect(pages).toBe(3);
    // Newest first; ULID-style ids here sort with creation order.
    expect(seen[0]).toBe("rt-09");
    expect(seen[9]).toBe("rt-00");
  });

  it("applies the q filter across the whole cursor walk", async () => {
    const seen: string[] = [];
    let from: string | undefined;

    for (;;) {
      const res = await data.refreshTokens.list(tenantId, {
        take: 2,
        from,
        q: "user_id:user-even",
      });
      seen.push(...res.refresh_tokens.map((rt) => rt.id));
      if (!res.next) break;
      from = res.next;
    }

    expect(seen.length).toBe(5);
    expect(seen.every((id) => Number(id.slice(3)) % 2 === 0)).toBe(true);
  });

  it("keeps offset totals scoped to the filter", async () => {
    const res = await data.refreshTokens.list(tenantId, {
      page: 0,
      per_page: 2,
      include_totals: true,
      q: "user_id:user-even",
    });

    expect(res.refresh_tokens).toHaveLength(2);
    // 5 matching rows, not the 10 in the tenant.
    expect(res.length).toBe(5);
  });
});

describe("refreshTokens auth-event columns", () => {
  it("round-trips session_id and re-nests auth_strategy", async () => {
    const { data } = getTestServer();
    await data.tenants.create({ id: "t2", name: "Tenant 2" });

    await data.refreshTokens.create("t2", {
      id: "rt-cols",
      login_id: "ls1",
      user_id: "u1",
      client_id: "clientA",
      session_id: "session-abc",
      organization: "org_1",
      auth_connection: "google-oauth2",
      auth_strategy: { strategy: "google", strategy_type: "social" },
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      resource_servers: [],
      rotating: false,
    });

    const stored = await data.refreshTokens.get("t2", "rt-cols");
    expect(stored!.session_id).toBe("session-abc");
    expect(stored!.organization).toBe("org_1");
    expect(stored!.auth_connection).toBe("google-oauth2");
    // Stored as two flat columns, exposed nested.
    expect(stored!.auth_strategy).toEqual({
      strategy: "google",
      strategy_type: "social",
    });
  });

  it("omits the columns entirely when unset, rather than returning null", async () => {
    const { data } = getTestServer();
    await data.tenants.create({ id: "t3", name: "Tenant 3" });

    await data.refreshTokens.create("t3", {
      id: "rt-bare",
      login_id: "ls1",
      user_id: "u1",
      client_id: "clientA",
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      resource_servers: [],
      rotating: false,
    });

    const stored = await data.refreshTokens.get("t3", "rt-bare");
    expect(stored!.session_id).toBeUndefined();
    expect(stored!.auth_strategy).toBeUndefined();
  });
});
