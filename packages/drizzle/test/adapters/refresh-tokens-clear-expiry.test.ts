import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

// `update` is three-valued on the expiry columns: `undefined` leaves the
// stored value alone, a string overwrites it, `null` clears it. Clearing is
// what a non-rotating refresh exchange needs when its client has been switched
// to a non-expiring refresh-token config — the row it keeps handing back has
// to lose the expiries it was stamped with at mint.
describe("refreshTokens update expiry clearing", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  const device = {
    last_ip: "",
    initial_ip: "",
    last_user_agent: "",
    initial_user_agent: "",
    initial_asn: "",
    last_asn: "",
  };

  const expires_at = new Date(Date.now() + 3600 * 1000).toISOString();
  const idle_expires_at = new Date(Date.now() + 600 * 1000).toISOString();

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;
    await data.tenants.create({ id: "t1", name: "T1" });
    await data.refreshTokens.create("t1", {
      id: "rt-1",
      login_id: "ls-1",
      user_id: "user-1",
      client_id: "c1",
      device,
      resource_servers: [],
      rotating: false,
      expires_at,
      idle_expires_at,
    });
  });

  it("clears both expiry columns when passed null", async () => {
    await data.refreshTokens.update("t1", "rt-1", {
      expires_at: null,
      idle_expires_at: null,
    });

    const row = await data.refreshTokens.get("t1", "rt-1");
    expect(row!.expires_at).toBeFalsy();
    expect(row!.idle_expires_at).toBeFalsy();
  });

  it("leaves a column untouched when it is omitted", async () => {
    await data.refreshTokens.update("t1", "rt-1", { expires_at: null });

    const row = await data.refreshTokens.get("t1", "rt-1");
    expect(row!.expires_at).toBeFalsy();
    expect(row!.idle_expires_at).toBe(idle_expires_at);
  });
});
