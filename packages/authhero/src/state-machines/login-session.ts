import { setup, assign } from "xstate";
import { LoginSession } from "@authhero/adapter-interfaces";

// This is a local version of the enum so that we can visualize the state machine
export enum LoginSessionState {
  /** Initial state - awaiting user authentication */
  PENDING = "pending",
  /** User credentials validated, but may need additional steps */
  AUTHENTICATED = "authenticated",
  /** Waiting for email verification */
  AWAITING_EMAIL_VERIFICATION = "awaiting_email_verification",
  /** Waiting for hook/flow completion (form, page redirect) */
  AWAITING_HOOK = "awaiting_hook",
  /** Waiting for user to complete action on continuation page (change-email, account, etc.) */
  AWAITING_CONTINUATION = "awaiting_continuation",
  /** Tokens issued successfully */
  COMPLETED = "completed",
  /** Authentication failed (wrong password, blocked, etc.) */
  FAILED = "failed",
  /** Session timed out */
  EXPIRED = "expired",
}

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
  /** Continuation scope - which pages are allowed during AWAITING_CONTINUATION */
  continuationScope?: string[];
  /** Additional state data */
  stateData?: Record<string, unknown>;
}

/**
 * Event types for the login session state machine
 */
export enum LoginSessionEventType {
  AUTHENTICATE = "AUTHENTICATE",
  REQUIRE_EMAIL_VERIFICATION = "REQUIRE_EMAIL_VERIFICATION",
  START_HOOK = "START_HOOK",
  COMPLETE_HOOK = "COMPLETE_HOOK",
  START_CONTINUATION = "START_CONTINUATION",
  COMPLETE_CONTINUATION = "COMPLETE_CONTINUATION",
  COMPLETE = "COMPLETE",
  FAIL = "FAIL",
  EXPIRE = "EXPIRE",
}

/**
 * Events that can trigger state transitions
 */
export type LoginSessionEvent =
  | { type: LoginSessionEventType.AUTHENTICATE; userId: string }
  | { type: LoginSessionEventType.REQUIRE_EMAIL_VERIFICATION }
  | { type: LoginSessionEventType.START_HOOK; hookId?: string }
  | { type: LoginSessionEventType.COMPLETE_HOOK }
  | { type: LoginSessionEventType.START_CONTINUATION; scope: string[] }
  | { type: LoginSessionEventType.COMPLETE_CONTINUATION }
  | { type: LoginSessionEventType.COMPLETE }
  | { type: LoginSessionEventType.FAIL; reason: string }
  | { type: LoginSessionEventType.EXPIRE };

/**
 * Login session state machine
 *
 * Flow:
 *   pending → authenticated → completed (happy path)
 *                          → awaiting_email_verification → completed (after verification)
 *                          → awaiting_hook → completed (after hook/flow completes)
 *                          → awaiting_continuation → authenticated (after account page action)
 *
 * Any state can transition to failed or expired
 *
 * States:
 * - pending: Initial state, awaiting user authentication
 * - authenticated: Credentials validated, user identified
 * - awaiting_email_verification: Blocked on email verification
 * - awaiting_hook: Waiting for hook/flow completion (form, page, impersonate)
 * - awaiting_continuation: Waiting for user to complete action on account page (change-email, etc.)
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
    setContinuationScope: assign({
      continuationScope: ({ event }) => {
        if (event.type === "START_CONTINUATION") {
          return event.scope;
        }
        return undefined;
      },
    }),
    clearContinuationScope: assign({
      continuationScope: () => undefined,
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
        START_CONTINUATION: {
          target: LoginSessionState.AWAITING_CONTINUATION,
          actions: "setContinuationScope",
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
    [LoginSessionState.AWAITING_CONTINUATION]: {
      on: {
        COMPLETE_CONTINUATION: {
          target: LoginSessionState.AUTHENTICATED,
          actions: "clearContinuationScope",
        },
        COMPLETE: {
          target: LoginSessionState.COMPLETED,
          actions: "clearContinuationScope",
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
    awaiting_continuation: LoginSessionState.AWAITING_CONTINUATION,
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
      START_CONTINUATION: LoginSessionState.AWAITING_CONTINUATION,
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
    [LoginSessionState.AWAITING_CONTINUATION]: {
      COMPLETE_CONTINUATION: LoginSessionState.AUTHENTICATED,
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
    if (event.type === "START_CONTINUATION") {
      contextUpdates.continuationScope = event.scope;
    }
    if (event.type === "COMPLETE_CONTINUATION") {
      contextUpdates.continuationScope = undefined;
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
    [LoginSessionState.PENDING]: [
      LoginSessionEventType.AUTHENTICATE,
      LoginSessionEventType.FAIL,
      LoginSessionEventType.EXPIRE,
    ],
    [LoginSessionState.AUTHENTICATED]: [
      LoginSessionEventType.REQUIRE_EMAIL_VERIFICATION,
      LoginSessionEventType.START_HOOK,
      LoginSessionEventType.START_CONTINUATION,
      LoginSessionEventType.COMPLETE,
      LoginSessionEventType.FAIL,
      LoginSessionEventType.EXPIRE,
    ],
    [LoginSessionState.AWAITING_EMAIL_VERIFICATION]: [
      LoginSessionEventType.COMPLETE,
      LoginSessionEventType.FAIL,
      LoginSessionEventType.EXPIRE,
    ],
    [LoginSessionState.AWAITING_HOOK]: [
      LoginSessionEventType.COMPLETE_HOOK,
      LoginSessionEventType.COMPLETE,
      LoginSessionEventType.FAIL,
      LoginSessionEventType.EXPIRE,
    ],
    [LoginSessionState.AWAITING_CONTINUATION]: [
      LoginSessionEventType.COMPLETE_CONTINUATION,
      LoginSessionEventType.COMPLETE,
      LoginSessionEventType.FAIL,
      LoginSessionEventType.EXPIRE,
    ],
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
