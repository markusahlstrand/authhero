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

  it("should transition to completed on COMPLETE event", () => {
    const actor = createActor(loginSessionMachine);
    actor.start();

    actor.send({ type: "COMPLETE", userId: "user123" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe(LoginSessionState.COMPLETED);
    expect(snapshot.context.userId).toBe("user123");
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

    actor.send({ type: "COMPLETE", userId: "user123" });
    actor.send({ type: "FAIL", reason: "Should not work" });

    // Should still be completed, not failed
    expect(actor.getSnapshot().value).toBe(LoginSessionState.COMPLETED);
  });
});

describe("getLoginSessionState", () => {
  it("should map state values to LoginSessionState enum", () => {
    expect(getLoginSessionState("pending")).toBe(LoginSessionState.PENDING);
    expect(getLoginSessionState("completed")).toBe(LoginSessionState.COMPLETED);
    expect(getLoginSessionState("failed")).toBe(LoginSessionState.FAILED);
    expect(getLoginSessionState("expired")).toBe(LoginSessionState.EXPIRED);
  });

  it("should default to PENDING for unknown states", () => {
    expect(getLoginSessionState("unknown")).toBe(LoginSessionState.PENDING);
  });
});

describe("transitionLoginSession", () => {
  it("should transition from pending to completed", () => {
    const result = transitionLoginSession(LoginSessionState.PENDING, {
      type: "COMPLETE",
      userId: "user123",
    });

    expect(result.state).toBe(LoginSessionState.COMPLETED);
    expect(result.context.userId).toBe("user123");
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
      type: "COMPLETE",
      userId: "user123",
    });

    // Should still be failed
    expect(result.state).toBe(LoginSessionState.FAILED);
    expect(result.context.userId).toBeUndefined();
  });
});

describe("canTransition", () => {
  it("should return true for valid transitions from pending", () => {
    expect(canTransition(LoginSessionState.PENDING, "COMPLETE")).toBe(true);
    expect(canTransition(LoginSessionState.PENDING, "FAIL")).toBe(true);
    expect(canTransition(LoginSessionState.PENDING, "EXPIRE")).toBe(true);
  });

  it("should return false for transitions from final states", () => {
    expect(canTransition(LoginSessionState.COMPLETED, "FAIL")).toBe(false);
    expect(canTransition(LoginSessionState.COMPLETED, "EXPIRE")).toBe(false);
    expect(canTransition(LoginSessionState.FAILED, "COMPLETE")).toBe(false);
    expect(canTransition(LoginSessionState.EXPIRED, "COMPLETE")).toBe(false);
  });
});


