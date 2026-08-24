import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

// A user id is selected with an exact predicate, never through the `q` Lucene
// grammar. Both SQL adapters split `q` on ` OR ` *before* tokenizing, so a
// crafted id like `attacker OR user_id:victim OR x` produces a clean middle
// clause that matches another user's rows — quoting does not help, because the
// quotes only bracket the first and last fragments.
const CRAFTED = "attacker OR user_id:victim OR x";

describe("refreshTokens user scoping", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  const device = {
    last_ip: "",
    initial_ip: "",
    last_user_agent: "",
    initial_user_agent: "",
    initial_asn: "",
    last_asn: "",
  };

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;
    await data.tenants.create({ id: "t1", name: "T1" });

    const mk = (id: string, user_id: string) =>
      data.refreshTokens.create("t1", {
        id,
        login_id: "ls1",
        user_id,
        client_id: "c1",
        device,
        resource_servers: [],
        rotating: false,
      });

    await mk("rt-victim", "victim");
    await mk("rt-attacker", "attacker");
    await mk("rt-crafted", CRAFTED);
  });

  it("list scopes to the exact user id, operators and all", async () => {
    const res = await data.refreshTokens.list("t1", {
      user_id: CRAFTED,
      per_page: 50,
    });
    expect(res.refresh_tokens.map((t) => t.id)).toEqual(["rt-crafted"]);
  });

  it("list does not leak another user's tokens via a crafted id", async () => {
    const res = await data.refreshTokens.list("t1", {
      user_id: "attacker OR user_id:victim OR x2",
      per_page: 50,
    });
    expect(res.refresh_tokens).toHaveLength(0);
  });

  it("revokeByUser revokes only that user's tokens", async () => {
    const revoked = await data.refreshTokens.revokeByUser(
      "t1",
      "attacker",
      new Date().toISOString(),
    );
    expect(revoked).toBe(1);

    expect(
      (await data.refreshTokens.get("t1", "rt-attacker"))!.revoked_at,
    ).toBeTruthy();
    expect(
      (await data.refreshTokens.get("t1", "rt-victim"))!.revoked_at,
    ).toBeFalsy();
  });

  it("revokeByUser does not widen via a crafted id", async () => {
    const revoked = await data.refreshTokens.revokeByUser(
      "t1",
      "attacker OR user_id:victim OR x2",
      new Date().toISOString(),
    );
    expect(revoked).toBe(0);
    for (const id of ["rt-victim", "rt-attacker", "rt-crafted"]) {
      expect((await data.refreshTokens.get("t1", id))!.revoked_at).toBeFalsy();
    }
  });

  it("preserves an existing revoked_at instead of overwriting it", async () => {
    const first = "2026-01-01T00:00:00.000Z";
    expect(await data.refreshTokens.revokeByUser("t1", "attacker", first)).toBe(
      1,
    );
    // A concurrent bulk revoke must not clobber the first audit timestamp.
    expect(
      await data.refreshTokens.revokeByUser(
        "t1",
        "attacker",
        new Date().toISOString(),
      ),
    ).toBe(0);
    expect(
      (await data.refreshTokens.get("t1", "rt-attacker"))!.revoked_at,
    ).toBe(first);
  });

  it("does not cross tenants", async () => {
    await data.tenants.create({ id: "t2", name: "T2" });
    await data.refreshTokens.create("t2", {
      id: "rt-other-tenant",
      login_id: "ls1",
      user_id: "attacker",
      client_id: "c1",
      device,
      resource_servers: [],
      rotating: false,
    });

    await data.refreshTokens.revokeByUser(
      "t1",
      "attacker",
      new Date().toISOString(),
    );
    expect(
      (await data.refreshTokens.get("t2", "rt-other-tenant"))!.revoked_at,
    ).toBeFalsy();
  });
});
