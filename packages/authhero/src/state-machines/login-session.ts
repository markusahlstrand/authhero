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
  /** Additional state data (e.g., MFA step, etc.) */
  stateData?: Record<string, unknown>;
}

/**
 * Events that can trigger state transitions
 */
export type LoginSessionEvent =
  | { type: "COMPLETE"; userId: string }
  | { type: "FAIL"; reason: string }
  | { type: "EXPIRE" };

/**
 * Login session state machine
 *
 * States:
 * - pending: Initial state, awaiting authentication
 * - completed: Successfully authenticated
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
        if (event.type === "COMPLETE") {
          return event.userId;
        }
        return undefined;
      },
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
        COMPLETE: {
          target: LoginSessionState.COMPLETED,
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

  // Build context updates based on event
  const contextUpdates: Partial<LoginSessionContext> = {};
  if (event.type === "COMPLETE" && nextState === LoginSessionState.COMPLETED) {
    contextUpdates.userId = event.userId;
  }
  if (event.type === "FAIL" && nextState === LoginSessionState.FAILED) {
    contextUpdates.failureReason = event.reason;
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
    [LoginSessionState.PENDING]: ["COMPLETE", "FAIL", "EXPIRE"],
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
