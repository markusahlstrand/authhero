import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { LoginSessionState } from "@authhero/adapter-interfaces";
import {
  loginSessionMachine,
  transitionLoginSession,
  canTransition,
  LoginSessionEventType,
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

    actor.send({ type: LoginSessionEventType.AUTHENTICATE, userId: "user123" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe(LoginSessionState.AUTHENTICATED);
    expect(snapshot.context.userId).toBe("user123");
  });

  it("should transition from authenticated to completed", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: LoginSessionEventType.AUTHENTICATE, userId: "user123" });
    actor.send({ type: LoginSessionEventType.COMPLETE });

    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });

  it("should transition to failed on FAIL event", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({
      type: LoginSessionEventType.FAIL,
      reason: "Invalid password",
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe(LoginSessionState.FAILED);
    expect(snapshot.context.failureReason).toBe("Invalid password");
  });

  it("should transition to expired on EXPIRE event", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: LoginSessionEventType.EXPIRE });

    expect(actor.getSnapshot().value).toBe(LoginSessionState.EXPIRED);
  });

  it("should not allow transitions from final states", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: LoginSessionEventType.AUTHENTICATE, userId: "user123" });
    actor.send({ type: LoginSessionEventType.COMPLETE });
    actor.send({
      type: LoginSessionEventType.FAIL,
      reason: "Should not work",
    });

    // Should still be completed, not failed
    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });

  it("should handle hook flow with hub pattern: authenticated -> awaiting_hook -> authenticated -> completed", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: LoginSessionEventType.AUTHENTICATE, userId: "user123" });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    actor.send({
      type: LoginSessionEventType.START_HOOK,
      hookId: "hook123",
    });
    const afterHook = actor.getSnapshot();
    expect(afterHook.value).toBe(LoginSessionState.AWAITING_HOOK);
    expect(afterHook.context.hookId).toBe("hook123");

    // Hub pattern: COMPLETE_HOOK returns to AUTHENTICATED
    actor.send({ type: LoginSessionEventType.COMPLETE_HOOK });
    const afterCompleteHook = actor.getSnapshot();
    expect(afterCompleteHook.value).toBe(LoginSessionState.AUTHENTICATED);
    expect(afterCompleteHook.context.hookId).toBeUndefined();

    // Then COMPLETE finishes the flow
    actor.send({ type: LoginSessionEventType.COMPLETE });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });

  it("should handle email verification flow with hub pattern", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: LoginSessionEventType.AUTHENTICATE, userId: "user123" });
    actor.send({ type: LoginSessionEventType.REQUIRE_EMAIL_VERIFICATION });
    expect(actor.getSnapshot().value).toBe(
      LoginSessionState.AWAITING_EMAIL_VERIFICATION,
    );

    // Hub pattern: COMPLETE from AWAITING_EMAIL_VERIFICATION returns to AUTHENTICATED
    actor.send({ type: LoginSessionEventType.COMPLETE });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    // Then COMPLETE finishes the flow
    actor.send({ type: LoginSessionEventType.COMPLETE });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });

  it("should allow COMPLETE_HOOK to return to authenticated for chained hooks", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: LoginSessionEventType.AUTHENTICATE, userId: "user123" });
    actor.send({ type: LoginSessionEventType.START_HOOK, hookId: "hook1" });
    actor.send({ type: LoginSessionEventType.COMPLETE_HOOK });

    // Back to authenticated, can start another hook
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    actor.send({ type: LoginSessionEventType.START_HOOK, hookId: "hook2" });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AWAITING_HOOK);
  });

  it("should allow chaining: email verification -> hook -> continuation -> completed", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    // Authenticate
    actor.send({ type: LoginSessionEventType.AUTHENTICATE, userId: "user123" });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    // Need email verification
    actor.send({ type: LoginSessionEventType.REQUIRE_EMAIL_VERIFICATION });
    expect(actor.getSnapshot().value).toBe(
      LoginSessionState.AWAITING_EMAIL_VERIFICATION,
    );

    // Email verified - back to authenticated
    actor.send({ type: LoginSessionEventType.COMPLETE });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    // Now needs a hook (e.g., postLogin)
    actor.send({ type: LoginSessionEventType.START_HOOK, hookId: "postLogin" });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AWAITING_HOOK);

    // Hook complete - back to authenticated
    actor.send({ type: LoginSessionEventType.COMPLETE_HOOK });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    // Now needs a continuation (e.g., change-email page)
    actor.send({
      type: LoginSessionEventType.START_CONTINUATION,
      scope: ["/u/account/change-email"],
    });
    expect(actor.getSnapshot().value).toBe(
      LoginSessionState.AWAITING_CONTINUATION,
    );

    // Continuation complete - back to authenticated
    actor.send({ type: LoginSessionEventType.COMPLETE_CONTINUATION });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.AUTHENTICATED);

    // Finally done
    actor.send({ type: LoginSessionEventType.COMPLETE });
    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });
});

describe("transitionLoginSession", () => {
  it("should transition from pending to authenticated", () => {
    const result = transitionLoginSession(LoginSessionState.PENDING, {
      type: LoginSessionEventType.AUTHENTICATE,
      userId: "user123",
    });

    expect(result.state).toBe(LoginSessionState.AUTHENTICATED);
    expect(result.context.userId).toBe("user123");
  });

  it("should transition from authenticated to completed", () => {
    const result = transitionLoginSession(LoginSessionState.AUTHENTICATED, {
      type: LoginSessionEventType.COMPLETE,
    });

    expect(result.state).toBe(LoginSessionState.COMPLETED);
  });

  it("should transition from pending to failed", () => {
    const result = transitionLoginSession(LoginSessionState.PENDING, {
      type: LoginSessionEventType.FAIL,
      reason: "Invalid password",
    });

    expect(result.state).toBe(LoginSessionState.FAILED);
    expect(result.context.failureReason).toBe("Invalid password");
  });

  it("should transition from pending to expired", () => {
    const result = transitionLoginSession(LoginSessionState.PENDING, {
      type: LoginSessionEventType.EXPIRE,
    });

    expect(result.state).toBe(LoginSessionState.EXPIRED);
  });

  it("should not transition from completed state", () => {
    const result = transitionLoginSession(LoginSessionState.COMPLETED, {
      type: LoginSessionEventType.FAIL,
      reason: "Should not work",
    });

    // Should still be completed
    expect(result.state).toBe(LoginSessionState.COMPLETED);
    expect(result.context.failureReason).toBeUndefined();
  });

  it("should not transition from failed state", () => {
    const result = transitionLoginSession(LoginSessionState.FAILED, {
      type: LoginSessionEventType.AUTHENTICATE,
      userId: "user123",
    });

    // Should still be failed
    expect(result.state).toBe(LoginSessionState.FAILED);
    expect(result.context.userId).toBeUndefined();
  });

  it("should handle hook transitions with hub pattern", () => {
    // Start hook
    const result1 = transitionLoginSession(LoginSessionState.AUTHENTICATED, {
      type: LoginSessionEventType.START_HOOK,
      hookId: "form123",
    });
    expect(result1.state).toBe(LoginSessionState.AWAITING_HOOK);
    expect(result1.context.hookId).toBe("form123");

    // Complete hook back to authenticated (hub pattern)
    const result2 = transitionLoginSession(LoginSessionState.AWAITING_HOOK, {
      type: LoginSessionEventType.COMPLETE_HOOK,
    });
    expect(result2.state).toBe(LoginSessionState.AUTHENTICATED);
    expect(result2.context.hookId).toBeUndefined();

    // COMPLETE from AWAITING_HOOK is not valid (must use COMPLETE_HOOK)
    const result3 = transitionLoginSession(LoginSessionState.AWAITING_HOOK, {
      type: LoginSessionEventType.COMPLETE,
    });
    // State unchanged because COMPLETE is not valid from AWAITING_HOOK
    expect(result3.state).toBe(LoginSessionState.AWAITING_HOOK);
  });

  it("should handle email verification with hub pattern", () => {
    // COMPLETE from AWAITING_EMAIL_VERIFICATION goes to AUTHENTICATED
    const result = transitionLoginSession(
      LoginSessionState.AWAITING_EMAIL_VERIFICATION,
      { type: LoginSessionEventType.COMPLETE },
    );
    expect(result.state).toBe(LoginSessionState.AUTHENTICATED);
  });
});

describe("canTransition", () => {
  it("should return true for valid transitions from pending", () => {
    expect(
      canTransition(LoginSessionState.PENDING, LoginSessionEventType.AUTHENTICATE),
    ).toBe(true);
    expect(
      canTransition(LoginSessionState.PENDING, LoginSessionEventType.FAIL),
    ).toBe(true);
    expect(
      canTransition(LoginSessionState.PENDING, LoginSessionEventType.EXPIRE),
    ).toBe(true);
  });

  it("should return true for valid transitions from authenticated", () => {
    expect(
      canTransition(
        LoginSessionState.AUTHENTICATED,
        LoginSessionEventType.REQUIRE_EMAIL_VERIFICATION,
      ),
    ).toBe(true);
    expect(
      canTransition(
        LoginSessionState.AUTHENTICATED,
        LoginSessionEventType.START_HOOK,
      ),
    ).toBe(true);
    expect(
      canTransition(
        LoginSessionState.AUTHENTICATED,
        LoginSessionEventType.COMPLETE,
      ),
    ).toBe(true);
    expect(
      canTransition(LoginSessionState.AUTHENTICATED, LoginSessionEventType.FAIL),
    ).toBe(true);
  });

  it("should return true for valid transitions from awaiting_hook", () => {
    expect(
      canTransition(
        LoginSessionState.AWAITING_HOOK,
        LoginSessionEventType.COMPLETE_HOOK,
      ),
    ).toBe(true);
    expect(
      canTransition(LoginSessionState.AWAITING_HOOK, LoginSessionEventType.FAIL),
    ).toBe(true);
  });

  it("should return false for COMPLETE from awaiting_hook (must use COMPLETE_HOOK)", () => {
    expect(
      canTransition(
        LoginSessionState.AWAITING_HOOK,
        LoginSessionEventType.COMPLETE,
      ),
    ).toBe(false);
  });

  it("should return false for transitions from final states", () => {
    expect(
      canTransition(LoginSessionState.COMPLETED, LoginSessionEventType.FAIL),
    ).toBe(false);
    expect(
      canTransition(LoginSessionState.COMPLETED, LoginSessionEventType.EXPIRE),
    ).toBe(false);
    expect(
      canTransition(LoginSessionState.FAILED, LoginSessionEventType.AUTHENTICATE),
    ).toBe(false);
    expect(
      canTransition(LoginSessionState.EXPIRED, LoginSessionEventType.AUTHENTICATE),
    ).toBe(false);
  });
});
