import { describe, it, expect, vi } from "vitest";
import type {
  AuditEvent,
  LogsDataAdapter,
} from "@authhero/adapter-interfaces";
import { LogsDestination } from "../../../src/helpers/outbox-destinations/logs";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    tenant_id: "tenant-1",
    event_type: "user.deleted",
    log_type: "sapi",
    category: "api",
    actor: { type: "admin", id: "admin-actor-id", email: "admin@example.com" },
    target: { type: "user", id: "auth0|deletedUser" },
    request: { method: "DELETE", path: "/users/auth0|deletedUser", ip: "1.2.3.4" },
    hostname: "localhost",
    timestamp: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

function makeDestination() {
  const logs = { create: vi.fn() } as unknown as LogsDataAdapter;
  return new LogsDestination(logs);
}

describe("LogsDestination.transform - user_id resolution", () => {
  it("uses the target user id for user-targeted operations, not the actor", () => {
    const { log } = makeDestination().transform(makeEvent());
    expect(log.user_id).toBe("auth0|deletedUser");
  });

  it("uses the target user id for identity link/unlink operations", () => {
    const { log } = makeDestination().transform(
      makeEvent({
        event_type: "identity.deleted",
        target: { type: "identity", id: "auth0|primaryUser" },
      }),
    );
    expect(log.user_id).toBe("auth0|primaryUser");
  });

  it("keeps the actor id for non-user resource operations", () => {
    const { log } = makeDestination().transform(
      makeEvent({
        event_type: "client.deleted",
        target: { type: "client", id: "clientId123" },
      }),
    );
    expect(log.user_id).toBe("admin-actor-id");
  });

  it("falls back to the actor id when the target id is empty", () => {
    const { log } = makeDestination().transform(
      makeEvent({ target: { type: "user", id: "" } }),
    );
    expect(log.user_id).toBe("admin-actor-id");
  });
});
