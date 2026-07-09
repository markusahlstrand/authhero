import { describe, expect, it } from "vitest";
import { OutboxEventInsert, Strategy } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

// A minimal, well-formed companion outbox event (#1057). The adapter persists
// it verbatim, deriving the NOT NULL aggregate columns from `target`.
function makeEvent(
  id: string,
  overrides: Partial<OutboxEventInsert> = {},
): OutboxEventInsert {
  return {
    id,
    tenant_id: "tenantId",
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: { type: "user", id: "email|u1" },
    request: { method: "POST", path: "/", ip: "" },
    hostname: "",
    timestamp: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

const baseUser = {
  email: "u1@example.com",
  email_verified: true,
  is_social: false,
  connection: Strategy.USERNAME_PASSWORD,
  provider: "authhero",
};

async function seedTenant(
  data: Awaited<ReturnType<typeof getTestServer>>["data"],
) {
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
}

describe("users adapter — companion outbox events (#1057)", () => {
  it("persists the user and its companion event in one transaction", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    await data.users.rawCreate(
      "tenantId",
      { user_id: "email|u1", ...baseUser },
      { outboxEvents: [makeEvent("evt-create")] },
    );

    expect(await data.users.get("tenantId", "email|u1")).not.toBeNull();
    expect(await data.outbox.getByIds(["evt-create"])).toHaveLength(1);
  });

  it("rolls back the event when the create collides", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    await data.users.rawCreate("tenantId", {
      user_id: "email|u1",
      ...baseUser,
    });

    await expect(
      data.users.rawCreate(
        "tenantId",
        { user_id: "email|u1", ...baseUser },
        { outboxEvents: [makeEvent("evt-loser")] },
      ),
    ).rejects.toThrow();

    expect(await data.outbox.getByIds(["evt-loser"])).toHaveLength(0);
  });

  it("persists the deletion event atomically with remove", async () => {
    const { data } = await getTestServer();
    await seedTenant(data);

    await data.users.rawCreate("tenantId", {
      user_id: "email|u1",
      ...baseUser,
    });

    const removed = await data.users.remove("tenantId", "email|u1", {
      outboxEvents: [
        makeEvent("evt-delete", { event_type: "hook.post-user-deletion" }),
      ],
    });

    expect(removed).toBe(true);
    expect(await data.users.get("tenantId", "email|u1")).toBeNull();
    expect(await data.outbox.getByIds(["evt-delete"])).toHaveLength(1);
  });
});
