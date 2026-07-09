import { describe, it, expect, beforeEach, vi } from "vitest";
import type { OutboxEventInsert } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

// A minimal, well-formed companion outbox event. The adapter persists it
// verbatim (JSON payload) — it performs no zod validation — so only the fields
// the insert reads need to be present.
function makeEvent(
  id: string,
  overrides: Partial<OutboxEventInsert> = {},
): OutboxEventInsert {
  return {
    id,
    tenant_id: "tenant1",
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: { type: "user", id: "auth0|u1" },
    request: { method: "POST", path: "/", ip: "" },
    hostname: "",
    timestamp: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

const baseUser = {
  email: "a@example.com",
  email_verified: true,
  is_social: false,
  provider: "auth0",
  connection: "Username-Password-Authentication",
  login_count: 0,
};

describe("users adapter — companion outbox events (#1057)", () => {
  let server: ReturnType<typeof getTestServer>;
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(async () => {
    server = getTestServer();
    data = server.data;
    await data.tenants.create({ id: "tenant1", name: "Test Tenant" });
  });

  it("persists the user and its companion event together on rawCreate", async () => {
    await data.users.rawCreate(
      "tenant1",
      { user_id: "auth0|u1", ...baseUser },
      { outboxEvents: [makeEvent("evt-create")] },
    );

    expect(await data.users.get("tenant1", "auth0|u1")).not.toBeNull();
    const events = await data.outbox.getByIds(["evt-create"]);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("hook.post-user-registration");
  });

  it("persists neither the user nor its event when the create rolls back", async () => {
    // First create wins.
    await data.users.rawCreate("tenant1", { user_id: "auth0|u1", ...baseUser });

    // Second create collides on the primary key — the whole atomic unit
    // (user insert + companion event) must roll back, leaving no event.
    await expect(
      data.users.rawCreate(
        "tenant1",
        { user_id: "auth0|u1", ...baseUser },
        { outboxEvents: [makeEvent("evt-loser")] },
      ),
    ).rejects.toThrow();

    expect(await data.outbox.getByIds(["evt-loser"])).toHaveLength(0);
  });

  it("persists the deletion event atomically with remove", async () => {
    await data.users.rawCreate("tenant1", { user_id: "auth0|u1", ...baseUser });

    const removed = await data.users.remove("tenant1", "auth0|u1", {
      outboxEvents: [
        makeEvent("evt-delete", { event_type: "hook.post-user-deletion" }),
      ],
    });

    expect(removed).toBe(true);
    expect(await data.users.get("tenant1", "auth0|u1")).toBeNull();
    const events = await data.outbox.getByIds(["evt-delete"]);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("hook.post-user-deletion");
  });

  it("routes the user and its event through a single db.batch() on a batch-capable driver", async () => {
    // Feature-detect batch support the same way runAtomic does: patching
    // `batch` onto the drizzle db makes createAdapters treat it as D1. The fake
    // executes the statements so the rows still land, and records the call.
    const batchSpy = vi.fn(async (statements: Promise<unknown>[]) => {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement);
      return results;
    });
    (server.db as unknown as { batch: typeof batchSpy }).batch = batchSpy;

    // No activity fields (login_count etc.) so the only companions are the
    // user row and the event — keeps the batch length assertion exact.
    await data.users.rawCreate(
      "tenant1",
      {
        user_id: "auth0|u1",
        email: "a@example.com",
        email_verified: true,
        is_social: false,
        provider: "auth0",
        connection: "Username-Password-Authentication",
      },
      { outboxEvents: [makeEvent("evt-batch")] },
    );

    expect(batchSpy).toHaveBeenCalledTimes(1);
    // One user insert + one outbox insert in the same batch.
    expect(batchSpy.mock.calls[0][0]).toHaveLength(2);

    expect(await data.users.get("tenant1", "auth0|u1")).not.toBeNull();
    expect(await data.outbox.getByIds(["evt-batch"])).toHaveLength(1);
  });
});
