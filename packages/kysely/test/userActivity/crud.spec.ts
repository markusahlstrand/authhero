import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

async function bootstrap(tenantId = "tenantId", userId = "auth2|user_1") {
  const { data } = await getTestServer();
  await data.tenants.create({
    id: tenantId,
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
  await data.users.create(tenantId, {
    user_id: userId,
    email: "alice@example.com",
    email_verified: true,
    provider: "auth2",
    connection: "Username-Password-Authentication",
    is_social: false,
    name: "Alice",
  });
  return { data, tenantId, userId };
}

describe("userActivity", () => {
  it("returns null when no row exists", async () => {
    const { data, tenantId, userId } = await bootstrap();
    expect(await data.userActivity!.get(tenantId, userId)).toBeNull();
  });

  it("inserts on first upsert", async () => {
    const { data, tenantId, userId } = await bootstrap();

    await data.userActivity!.upsert(tenantId, userId, {
      last_login: "2026-06-30T10:00:00.000Z",
      last_ip: "203.0.113.7",
      login_count: 1,
    });

    const activity = await data.userActivity!.get(tenantId, userId);
    expect(activity).toMatchObject({
      user_id: userId,
      last_login: "2026-06-30T10:00:00.000Z",
      last_ip: "203.0.113.7",
      login_count: 1,
    });
  });

  it("merge-updates without clobbering unset fields", async () => {
    const { data, tenantId, userId } = await bootstrap();

    await data.userActivity!.upsert(tenantId, userId, {
      last_login: "2026-06-30T10:00:00.000Z",
      last_ip: "203.0.113.7",
      login_count: 1,
    });
    // Second login only bumps the counter + timestamps; last_ip stays unless set.
    await data.userActivity!.upsert(tenantId, userId, {
      last_login: "2026-06-30T11:00:00.000Z",
      login_count: 2,
    });

    const activity = await data.userActivity!.get(tenantId, userId);
    expect(activity).toMatchObject({
      last_login: "2026-06-30T11:00:00.000Z",
      last_ip: "203.0.113.7", // preserved
      login_count: 2,
    });
  });

  it("round-trips failed_logins as a JSON array", async () => {
    const { data, tenantId, userId } = await bootstrap();

    await data.userActivity!.upsert(tenantId, userId, {
      failed_logins: ["2026-06-30T10:00:00.000Z", "2026-06-30T10:01:00.000Z"],
    });

    const activity = await data.userActivity!.get(tenantId, userId);
    expect(activity?.failed_logins).toEqual([
      "2026-06-30T10:00:00.000Z",
      "2026-06-30T10:01:00.000Z",
    ]);
    // login_count defaults to 0 when the row is created by a non-login write.
    expect(activity?.login_count).toBe(0);
  });
});
