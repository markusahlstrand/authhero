import { setup, assign } from "xstate";
import { LoginSession, LoginSessionState } from "@authhero/adapter-interfaces";

/**
 * Context for the login session state machine
 */
export interface LoginSessionContext {
  /** User ID once identified */
  userId?: string;
  /** Error/failure reason if login failed */
  failureReason?: string;
  /** Hook/flow ID if waiting for completion */
  hookId?: string;
  /** Additional state data */
  stateData?: Record<string, unknown>;
}

/**
 * Events that can trigger state transitions
 */
export type LoginSessionEvent =
  | { type: "AUTHENTICATE"; userId: string }
  | { type: "REQUIRE_EMAIL_VERIFICATION" }
  | { type: "START_HOOK"; hookId?: string }
  | { type: "COMPLETE_HOOK" }
  | { type: "COMPLETE" }
  | { type: "FAIL"; reason: string }
  | { type: "EXPIRE" };

/**
 * Login session state machine
 *
 * Flow:
 *   pending → authenticated → completed (happy path)
 *                          → awaiting_email_verification → completed (after verification)
 *                          → awaiting_hook → completed (after hook/flow completes)
 *
 * Any state can transition to failed or expired
 *
 * States:
 * - pending: Initial state, awaiting user authentication
 * - authenticated: Credentials validated, user identified
 * - awaiting_email_verification: Blocked on email verification
 * - awaiting_hook: Waiting for hook/flow completion (form, page, impersonate)
 * - completed: Tokens issued successfully
 * - failed: Authentication failed (wrong password, blocked, etc.)
 * - expired: Session timed out
 */
export const loginSessionMachine = setup({
  types: {
    context: {} as LoginSessionContext,
    events: {} as LoginSessionEvent,
  },
  actions: {
    setUserId: assign({
      userId: ({ event }) => {
        if (event.type === "AUTHENTICATE") {
          return event.userId;
        }
        return undefined;
      },
    }),
    setHookId: assign({
      hookId: ({ event }) => {
        if (event.type === "START_HOOK") {
          return event.hookId;
        }
        return undefined;
      },
    }),
    clearHookId: assign({
      hookId: () => undefined,
    }),
    setFailureReason: assign({
      failureReason: ({ event }) => {
        if (event.type === "FAIL") {
          return event.reason;
        }
        return undefined;
      },
    }),
  },
}).createMachine({
  id: "loginSession",
  initial: LoginSessionState.PENDING,
  context: {},
  states: {
    [LoginSessionState.PENDING]: {
      on: {
        AUTHENTICATE: {
          target: LoginSessionState.AUTHENTICATED,
          actions: "setUserId",
        },
        FAIL: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        EXPIRE: {
          target: LoginSessionState.EXPIRED,
        },
      },
    },
    [LoginSessionState.AUTHENTICATED]: {
      on: {
        REQUIRE_EMAIL_VERIFICATION: {
          target: LoginSessionState.AWAITING_EMAIL_VERIFICATION,
        },
        START_HOOK: {
          target: LoginSessionState.AWAITING_HOOK,
          actions: "setHookId",
        },
        COMPLETE: {
          target: LoginSessionState.COMPLETED,
        },
        FAIL: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        EXPIRE: {
          target: LoginSessionState.EXPIRED,
        },
      },
    },
    [LoginSessionState.AWAITING_EMAIL_VERIFICATION]: {
      on: {
        COMPLETE: {
          target: LoginSessionState.COMPLETED,
        },
        FAIL: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        EXPIRE: {
          target: LoginSessionState.EXPIRED,
        },
      },
    },
    [LoginSessionState.AWAITING_HOOK]: {
      on: {
        COMPLETE_HOOK: {
          target: LoginSessionState.AUTHENTICATED,
          actions: "clearHookId",
        },
        COMPLETE: {
          target: LoginSessionState.COMPLETED,
          actions: "clearHookId",
        },
        FAIL: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        EXPIRE: {
          target: LoginSessionState.EXPIRED,
        },
      },
    },
    [LoginSessionState.COMPLETED]: {
      type: "final",
    },
    [LoginSessionState.FAILED]: {
      type: "final",
    },
    [LoginSessionState.EXPIRED]: {
      type: "final",
    },
  },
});

/**
 * Get the LoginSessionState from a state machine state value
 */
export function getLoginSessionState(stateValue: string): LoginSessionState {
  const stateMap: Record<string, LoginSessionState> = {
    pending: LoginSessionState.PENDING,
    authenticated: LoginSessionState.AUTHENTICATED,
    awaiting_email_verification: LoginSessionState.AWAITING_EMAIL_VERIFICATION,
    awaiting_hook: LoginSessionState.AWAITING_HOOK,
    completed: LoginSessionState.COMPLETED,
    failed: LoginSessionState.FAILED,
    expired: LoginSessionState.EXPIRED,
  };
  return stateMap[stateValue] ?? LoginSessionState.PENDING;
}

/**
 * Transition a login session and return the new state
 * This is a pure function that computes the next state without side effects
 */
export function transitionLoginSession(
  currentState: LoginSessionState,
  event: LoginSessionEvent,
): { state: LoginSessionState; context: Partial<LoginSessionContext> } {
  // Define valid transitions
  const transitions: Record<
    LoginSessionState,
    Partial<Record<LoginSessionEvent["type"], LoginSessionState>>
  > = {
    [LoginSessionState.PENDING]: {
      AUTHENTICATE: LoginSessionState.AUTHENTICATED,
      FAIL: LoginSessionState.FAILED,
      EXPIRE: LoginSessionState.EXPIRED,
    },
    [LoginSessionState.AUTHENTICATED]: {
      REQUIRE_EMAIL_VERIFICATION: LoginSessionState.AWAITING_EMAIL_VERIFICATION,
      START_HOOK: LoginSessionState.AWAITING_HOOK,
      COMPLETE: LoginSessionState.COMPLETED,
      FAIL: LoginSessionState.FAILED,
      EXPIRE: LoginSessionState.EXPIRED,
    },
    [LoginSessionState.AWAITING_EMAIL_VERIFICATION]: {
      COMPLETE: LoginSessionState.COMPLETED,
      FAIL: LoginSessionState.FAILED,
      EXPIRE: LoginSessionState.EXPIRED,
    },
    [LoginSessionState.AWAITING_HOOK]: {
      COMPLETE_HOOK: LoginSessionState.AUTHENTICATED,
      COMPLETE: LoginSessionState.COMPLETED,
      FAIL: LoginSessionState.FAILED,
      EXPIRE: LoginSessionState.EXPIRED,
    },
    // Final states - no transitions allowed
    [LoginSessionState.COMPLETED]: {},
    [LoginSessionState.FAILED]: {},
    [LoginSessionState.EXPIRED]: {},
  };

  const nextState = transitions[currentState]?.[event.type] ?? currentState;

  // Build context updates based on event - only if transition is valid
  const contextUpdates: Partial<LoginSessionContext> = {};
  const transitionOccurred = nextState !== currentState;
  
  if (transitionOccurred) {
    if (event.type === "AUTHENTICATE") {
      contextUpdates.userId = event.userId;
    }
    if (event.type === "START_HOOK") {
      contextUpdates.hookId = event.hookId;
    }
    if (event.type === "COMPLETE_HOOK" || event.type === "COMPLETE") {
      contextUpdates.hookId = undefined;
    }
    if (event.type === "FAIL") {
      contextUpdates.failureReason = event.reason;
    }
  }

  return { state: nextState, context: contextUpdates };
}

/**
 * Check if a login session can transition with the given event
 */
export function canTransition(
  currentState: LoginSessionState,
  eventType: LoginSessionEvent["type"],
): boolean {
  const validTransitions: Record<
    LoginSessionState,
    LoginSessionEvent["type"][]
  > = {
    [LoginSessionState.PENDING]: ["AUTHENTICATE", "FAIL", "EXPIRE"],
    [LoginSessionState.AUTHENTICATED]: ["REQUIRE_EMAIL_VERIFICATION", "START_HOOK", "COMPLETE", "FAIL", "EXPIRE"],
    [LoginSessionState.AWAITING_EMAIL_VERIFICATION]: ["COMPLETE", "FAIL", "EXPIRE"],
    [LoginSessionState.AWAITING_HOOK]: ["COMPLETE_HOOK", "COMPLETE", "FAIL", "EXPIRE"],
    [LoginSessionState.COMPLETED]: [],
    [LoginSessionState.FAILED]: [],
    [LoginSessionState.EXPIRED]: [],
  };

  return validTransitions[currentState]?.includes(eventType) ?? false;
}

/**
 * Helper to transition from a LoginSession object
 */
export function transitionLoginSessionFromEntity(
  loginSession: LoginSession,
  event: LoginSessionEvent,
): { state: LoginSessionState; context: Partial<LoginSessionContext> } {
  return transitionLoginSession(
    loginSession.state || LoginSessionState.PENDING,
    event,
  );
}
