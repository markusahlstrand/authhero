import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

// Ownership lives on `session_id`. `login_id` records only the authorization
// transaction a token was minted in, and one session accumulates many of those
// over its life, so a login-keyed cascade misses tokens from every SSO
// re-authorization after the first.
describe("refreshTokens revokeBySession", () => {
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

    const mk = (id: string, login_id: string, session_id?: string) =>
      data.refreshTokens.create("t1", {
        id,
        login_id,
        session_id,
        user_id: "user-1",
        client_id: "c1",
        device,
        resource_servers: [],
        rotating: false,
      });

    // Two login sessions feeding one session — the SSO re-authorization case.
    await mk("rt-first-login", "ls-1", "sess-1");
    await mk("rt-later-login", "ls-2", "sess-1");
    // A different session for the same user.
    await mk("rt-other-session", "ls-3", "sess-2");
    // A row from before the column existed.
    await mk("rt-legacy", "ls-4", undefined);
  });

  it("revokes every token owned by the session, whatever login minted it", async () => {
    const revoked = await data.refreshTokens.revokeBySession(
      "t1",
      "sess-1",
      new Date().toISOString(),
    );
    expect(revoked).toBe(2);

    expect(
      (await data.refreshTokens.get("t1", "rt-first-login"))!.revoked_at,
    ).toBeTruthy();
    expect(
      (await data.refreshTokens.get("t1", "rt-later-login"))!.revoked_at,
    ).toBeTruthy();
  });

  it("leaves another session's tokens for the same user alone", async () => {
    await data.refreshTokens.revokeBySession(
      "t1",
      "sess-1",
      new Date().toISOString(),
    );

    expect(
      (await data.refreshTokens.get("t1", "rt-other-session"))!.revoked_at,
    ).toBeFalsy();
  });

  it("does not match rows that carry no session_id", async () => {
    const revoked = await data.refreshTokens.revokeBySession(
      "t1",
      "sess-1",
      new Date().toISOString(),
    );
    expect(revoked).toBe(2);

    expect(
      (await data.refreshTokens.get("t1", "rt-legacy"))!.revoked_at,
    ).toBeFalsy();
  });

  it("skips already-revoked rows so the first timestamp survives", async () => {
    const first = new Date(Date.now() - 60_000).toISOString();
    expect(
      await data.refreshTokens.revokeBySession("t1", "sess-1", first),
    ).toBe(2);

    const second = new Date().toISOString();
    expect(
      await data.refreshTokens.revokeBySession("t1", "sess-1", second),
    ).toBe(0);

    const stored = await data.refreshTokens.get("t1", "rt-first-login");
    expect(stored!.revoked_at).toBe(first);
  });

  it("does not cross tenants", async () => {
    await data.tenants.create({ id: "t2", name: "T2" });
    await data.refreshTokens.create("t2", {
      id: "rt-other-tenant",
      login_id: "ls-1",
      session_id: "sess-1",
      user_id: "user-1",
      client_id: "c1",
      device,
      resource_servers: [],
      rotating: false,
    });

    expect(
      await data.refreshTokens.revokeBySession(
        "t1",
        "sess-1",
        new Date().toISOString(),
      ),
    ).toBe(2);
    expect(
      (await data.refreshTokens.get("t2", "rt-other-tenant"))!.revoked_at,
    ).toBeFalsy();
  });
});
