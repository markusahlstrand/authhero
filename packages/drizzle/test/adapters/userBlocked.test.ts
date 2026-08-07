import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("users adapter — blocked", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(async () => {
    data = getTestServer().data;
    await data.tenants.create({ id: "t1", name: "T1" });
  });

  it("defaults to unblocked and round-trips create/update", async () => {
    const created = await data.users.create("t1", {
      email: "u@example.com",
      connection: "Username-Password-Authentication",
      provider: "auth2",
      user_id: "auth2|u",
    });
    // Absent on create → not blocked (falsy).
    expect(created.blocked ?? false).toBe(false);

    await data.users.update("t1", "auth2|u", { blocked: true });
    expect((await data.users.get("t1", "auth2|u"))!.blocked).toBe(true);

    await data.users.update("t1", "auth2|u", { blocked: false });
    expect((await data.users.get("t1", "auth2|u"))!.blocked).toBe(false);
  });

  it("persists blocked when set at create time", async () => {
    await data.users.create("t1", {
      email: "b@example.com",
      connection: "Username-Password-Authentication",
      provider: "auth2",
      user_id: "auth2|b",
      blocked: true,
    });
    expect((await data.users.get("t1", "auth2|b"))!.blocked).toBe(true);
  });
});
