import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { LoginSessionState } from "@authhero/adapter-interfaces";
import {
  loginSessionMachine,
  getLoginSessionState,
  transitionLoginSession,
  canTransition,
} from "../../src/state-machines/login-session";

describe("loginSessionMachine", () => {
  it("should start in pending state", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    expect(actor.getSnapshot().value).toBe(LoginSessionState.PENDING);
  });

  it("should transition to authenticated on AUTHENTICATE event", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "AUTHENTICATE", userId: "user123" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe(LoginSessionState.AUTHENTICATED);
    expect(snapshot.context.userId).toBe("user123");
  });

  it("should transition from authenticated to completed", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "AUTHENTICATE", userId: "user123" });
    actor.send({ type: "COMPLETE" });

    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });

  it("should transition to failed on FAIL event", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "FAIL", reason: "Invalid password" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe(LoginSessionState.FAILED);
    expect(snapshot.context.failureReason).toBe("Invalid password");
  });

  it("should transition to expired on EXPIRE event", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "EXPIRE" });

    expect(actor.getSnapshot().value).toBe(LoginSessionState.EXPIRED);
  });

  it("should not allow transitions from final states", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "AUTHENTICATE", userId: "user123" });
    actor.send({ type: "COMPLETE" });
    actor.send({ type: "FAIL", reason: "Should not work" });

    // Should still be completed, not failed
    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });

  it("should handle hook flow: authenticated -> awaiting_hook -> completed", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "AUTHENTICATE", userId: "user123" });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    actor.send({ type: "START_HOOK", hookId: "hook123" });
    const afterHook = actor.getSnapshot();
    expect(afterHook.value).toBe(LoginSessionState.AWAITING_HOOK);
    expect(afterHook.context.hookId).toBe("hook123");

    actor.send({ type: "COMPLETE" });
    const final = actor.getSnapshot();
    expect(final.value).toBe(LoginSessionState.COMPLETED);
    expect(final.context.hookId).toBeUndefined();
  });

  it("should handle email verification flow", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "AUTHENTICATE", userId: "user123" });
    actor.send({ type: "REQUIRE_EMAIL_VERIFICATION" });
    expect(actor.getSnapshot().value).toBe(
      LoginSessionState.AWAITING_EMAIL_VERIFICATION,
    );

    actor.send({ type: "COMPLETE" });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });

  it("should allow COMPLETE_HOOK to return to authenticated for chained hooks", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "AUTHENTICATE", userId: "user123" });
    actor.send({ type: "START_HOOK", hookId: "hook1" });
    actor.send({ type: "COMPLETE_HOOK" });

    // Back to authenticated, can start another hook
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    actor.send({ type: "START_HOOK", hookId: "hook2" });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AWAITING_HOOK);
  });
});

describe("getLoginSessionState", () => {
  it("should map state values to LoginSessionState enum", () => {
    expect(getLoginSessionState("pending")).toBe(LoginSessionState.PENDING);
    expect(getLoginSessionState("authenticated")).toBe(
      LoginSessionState.AUTHENTICATED,
    );
    expect(getLoginSessionState("awaiting_email_verification")).toBe(
      LoginSessionState.AWAITING_EMAIL_VERIFICATION,
    );
    expect(getLoginSessionState("awaiting_hook")).toBe(
      LoginSessionState.AWAITING_HOOK,
    );
    expect(getLoginSessionState("completed")).toBe(LoginSessionState.COMPLETED);
    expect(getLoginSessionState("failed")).toBe(LoginSessionState.FAILED);
    expect(getLoginSessionState("expired")).toBe(LoginSessionState.EXPIRED);
  });

  it("should default to PENDING for unknown states", () => {
    expect(getLoginSessionState("unknown")).toBe(LoginSessionState.PENDING);
  });
});

describe("transitionLoginSession", () => {
  it("should transition from pending to authenticated", () => {
    const result = transitionLoginSession(LoginSessionState.PENDING, {
      type: "AUTHENTICATE",
      userId: "user123",
    });

    expect(result.state).toBe(LoginSessionState.AUTHENTICATED);
    expect(result.context.userId).toBe("user123");
  });

  it("should transition from authenticated to completed", () => {
    const result = transitionLoginSession(LoginSessionState.AUTHENTICATED, {
      type: "COMPLETE",
    });

    expect(result.state).toBe(LoginSessionState.COMPLETED);
  });

  it("should transition from pending to failed", () => {
    const result = transitionLoginSession(LoginSessionState.PENDING, {
      type: "FAIL",
      reason: "Invalid password",
    });

    expect(result.state).toBe(LoginSessionState.FAILED);
    expect(result.context.failureReason).toBe("Invalid password");
  });

  it("should transition from pending to expired", () => {
    const result = transitionLoginSession(LoginSessionState.PENDING, {
      type: "EXPIRE",
    });

    expect(result.state).toBe(LoginSessionState.EXPIRED);
  });

  it("should not transition from completed state", () => {
    const result = transitionLoginSession(LoginSessionState.COMPLETED, {
      type: "FAIL",
      reason: "Should not work",
    });

    // Should still be completed
    expect(result.state).toBe(LoginSessionState.COMPLETED);
    expect(result.context.failureReason).toBeUndefined();
  });

  it("should not transition from failed state", () => {
    const result = transitionLoginSession(LoginSessionState.FAILED, {
      type: "AUTHENTICATE",
      userId: "user123",
    });

    // Should still be failed
    expect(result.state).toBe(LoginSessionState.FAILED);
    expect(result.context.userId).toBeUndefined();
  });

  it("should handle hook transitions", () => {
    // Start hook
    const result1 = transitionLoginSession(LoginSessionState.AUTHENTICATED, {
      type: "START_HOOK",
      hookId: "form123",
    });
    expect(result1.state).toBe(LoginSessionState.AWAITING_HOOK);
    expect(result1.context.hookId).toBe("form123");

    // Complete hook back to authenticated
    const result2 = transitionLoginSession(LoginSessionState.AWAITING_HOOK, {
      type: "COMPLETE_HOOK",
    });
    expect(result2.state).toBe(LoginSessionState.AUTHENTICATED);
    expect(result2.context.hookId).toBeUndefined();

    // Complete directly from awaiting_hook
    const result3 = transitionLoginSession(LoginSessionState.AWAITING_HOOK, {
      type: "COMPLETE",
    });
    expect(result3.state).toBe(LoginSessionState.COMPLETED);
  });
});

describe("canTransition", () => {
  it("should return true for valid transitions from pending", () => {
    expect(canTransition(LoginSessionState.PENDING, "AUTHENTICATE")).toBe(true);
    expect(canTransition(LoginSessionState.PENDING, "FAIL")).toBe(true);
    expect(canTransition(LoginSessionState.PENDING, "EXPIRE")).toBe(true);
  });

  it("should return true for valid transitions from authenticated", () => {
    expect(
      canTransition(
        LoginSessionState.AUTHENTICATED,
        "REQUIRE_EMAIL_VERIFICATION",
      ),
    ).toBe(true);
    expect(canTransition(LoginSessionState.AUTHENTICATED, "START_HOOK")).toBe(
      true,
    );
    expect(canTransition(LoginSessionState.AUTHENTICATED, "COMPLETE")).toBe(
      true,
    );
    expect(canTransition(LoginSessionState.AUTHENTICATED, "FAIL")).toBe(true);
  });

  it("should return true for valid transitions from awaiting_hook", () => {
    expect(
      canTransition(LoginSessionState.AWAITING_HOOK, "COMPLETE_HOOK"),
    ).toBe(true);
    expect(canTransition(LoginSessionState.AWAITING_HOOK, "COMPLETE")).toBe(
      true,
    );
    expect(canTransition(LoginSessionState.AWAITING_HOOK, "FAIL")).toBe(true);
  });

  it("should return false for transitions from final states", () => {
    expect(canTransition(LoginSessionState.COMPLETED, "FAIL")).toBe(false);
    expect(canTransition(LoginSessionState.COMPLETED, "EXPIRE")).toBe(false);
    expect(canTransition(LoginSessionState.FAILED, "AUTHENTICATE")).toBe(false);
    expect(canTransition(LoginSessionState.EXPIRED, "AUTHENTICATE")).toBe(
      false,
    );
  });
});
