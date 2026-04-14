import { describe, it, expect, vi } from "vitest";
import type { AuditEvent } from "@authhero/adapter-interfaces";
import { RegistrationFinalizerDestination } from "../../../src/helpers/outbox-destinations/registration-finalizer";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    tenant_id: "tenant-1",
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: { type: "user", id: "user-1" },
    request: { method: "POST", path: "/users", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("RegistrationFinalizerDestination", () => {
  it("accepts only hook.post-user-registration events", () => {
    const users = { update: vi.fn() } as any;
    const dest = new RegistrationFinalizerDestination(users);

    expect(dest.accepts(makeEvent())).toBe(true);
    expect(
      dest.accepts(makeEvent({ event_type: "hook.post-user-login" })),
    ).toBe(false);
    expect(dest.accepts(makeEvent({ event_type: "user.created" }))).toBe(false);
  });

  it("sets registration_completed_at on the target user", async () => {
    const update = vi.fn().mockResolvedValue(true);
    const users = { update } as any;
    const dest = new RegistrationFinalizerDestination(users);

    const event = makeEvent({
      tenant_id: "tenant-a",
      target: { type: "user", id: "user-xyz" },
    });
    const task = dest.transform(event);
    await dest.deliver([task]);

    expect(update).toHaveBeenCalledTimes(1);
    const [tenantId, userId, updates] = update.mock.calls[0];
    expect(tenantId).toBe("tenant-a");
    expect(userId).toBe("user-xyz");
    expect(typeof updates.registration_completed_at).toBe("string");
    expect(() => new Date(updates.registration_completed_at)).not.toThrow();
  });

  it("skips events with missing target id", async () => {
    const update = vi.fn().mockResolvedValue(true);
    const users = { update } as any;
    const dest = new RegistrationFinalizerDestination(users);

    const event = makeEvent({ target: { type: "user", id: "" } });
    const task = dest.transform(event);
    await dest.deliver([task]);

    expect(update).not.toHaveBeenCalled();
  });

  it("propagates adapter errors so the relay retries", async () => {
    const update = vi.fn().mockRejectedValue(new Error("db down"));
    const users = { update } as any;
    const dest = new RegistrationFinalizerDestination(users);

    const task = dest.transform(makeEvent());

    await expect(dest.deliver([task])).rejects.toThrow("db down");
  });
});
