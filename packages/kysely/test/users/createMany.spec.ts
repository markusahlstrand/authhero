import { describe, expect, it } from "vitest";

import { OutboxEventInsert, Strategy } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

/**
 * The adapter under test is optional on the interface, so pull it out once and
 * fail loudly rather than repeating a non-null assertion in every test.
 */
async function seedTenant() {
  const { data } = await getTestServer();
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
  if (!data.users.createMany) {
    throw new Error("the kysely adapter should implement users.createMany");
  }
  return { data, createMany: data.users.createMany };
}

const baseUser = {
  email_verified: true,
  is_social: false,
  connection: Strategy.USERNAME_PASSWORD,
  provider: "authhero",
};

describe("users.createMany", () => {
  it("returns the created users when no metadata is supplied", async () => {
    // app_metadata and user_metadata are optional, and an import row rarely
    // carries them. Round-tripping the serialized column through JSON.parse
    // would throw on `undefined` *after* the transaction committed, so the
    // caller would see a rejection for writes that actually landed — and, for
    // the bulk import, silently drop back to writing every row one at a time.
    const { data, createMany } = await seedTenant();

    const created = await createMany("tenantId", [
      { ...baseUser, user_id: "email|plain1", email: "plain1@example.com" },
      { ...baseUser, user_id: "email|plain2", email: "plain2@example.com" },
    ]);

    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      user_id: "email|plain1",
      email: "plain1@example.com",
      email_verified: true,
    });
    expect(created[0]!.app_metadata).toBeUndefined();
    expect(created[0]!.user_metadata).toBeUndefined();

    const stored = await data.users.get("tenantId", "email|plain2");
    expect(stored?.email).toBe("plain2@example.com");
  });

  it("returns metadata as objects when it is supplied", async () => {
    const { createMany } = await seedTenant();

    const created = await createMany("tenantId", [
      {
        ...baseUser,
        user_id: "email|meta1",
        email: "meta1@example.com",
        app_metadata: { plan: "pro" },
        user_metadata: { locale: "sv" },
        address: { country: "SE" },
      },
    ]);

    expect(created[0]!.app_metadata).toEqual({ plan: "pro" });
    expect(created[0]!.user_metadata).toEqual({ locale: "sv" });
    expect(created[0]!.address).toEqual({ country: "SE" });
  });

  it("writes the companion password row", async () => {
    const { data, createMany } = await seedTenant();

    await createMany("tenantId", [
      {
        ...baseUser,
        user_id: "email|pw1",
        email: "pw1@example.com",
        password: { hash: "hashed-value", algorithm: "bcrypt" },
      },
    ]);

    const password = await data.passwords.get("tenantId", "email|pw1");
    expect(password?.password).toBe("hashed-value");
    expect(password?.algorithm).toBe("bcrypt");
  });

  it("rejects outbox events instead of dropping them", async () => {
    const { createMany } = await seedTenant();
    // createMany never writes the outbox, so accepting an event would report
    // success while dropping the caller's audit trail.
    const event: OutboxEventInsert = {
      id: "evt1",
      tenant_id: "tenantId",
      event_type: "hook.post-user-registration",
      log_type: "sapi",
      category: "system",
      actor: { type: "system" },
      target: { type: "user", id: "email|ob1" },
      request: { method: "POST", path: "/", ip: "" },
      hostname: "",
      timestamp: "2026-09-09T00:00:00.000Z",
    };

    await expect(
      createMany(
        "tenantId",
        [{ ...baseUser, user_id: "email|ob1", email: "ob1@example.com" }],
        {
          outboxEvents: [event],
        },
      ),
    ).rejects.toThrow();
  });
});
