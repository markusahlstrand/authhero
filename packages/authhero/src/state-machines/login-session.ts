import { setup, assign, getNextSnapshot } from "xstate";
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
 * The AUTHENTICATED state acts as a "hub" that decides the next requirement.
 * After completing hooks or continuations, the flow returns to AUTHENTICATED
 * so the backend can check if additional steps are needed.
 *
 * Flow examples:
 *   pending → authenticated → completed (simple login)
 *   pending → authenticated → awaiting_email_verification → authenticated → completed
 *   pending → authenticated → awaiting_hook → authenticated → awaiting_continuation → authenticated → completed
 *
 * Any non-final state can transition to failed or expired.
 *
 * States:
 * - pending: Initial state, awaiting user authentication
 * - authenticated: Credentials validated - hub state that decides next steps
 * - awaiting_email_verification: Blocked on email verification
 * - awaiting_hook: Waiting for hook/flow completion (form, page, impersonate)
 * - awaiting_continuation: Waiting for user to complete action on account page
 * - completed: Tokens issued successfully (final)
 * - failed: Authentication failed (final)
 * - expired: Session timed out (final)
 */
export const loginSessionMachine = setup({
  types: {
    context: {} as LoginSessionContext,
    events: {} as LoginSessionEvent,
  },
  actions: {
    // Type-safe action that only sets userId from AUTHENTICATE events
    setUserId: assign(({ event }) => {
      if (event.type === LoginSessionEventType.AUTHENTICATE) {
        return { userId: event.userId };
      }
      return {};
    }),
    // Type-safe action that only sets hookId from START_HOOK events
    setHookId: assign(({ event }) => {
      if (event.type === LoginSessionEventType.START_HOOK) {
        return { hookId: event.hookId };
      }
      return {};
    }),
    clearHookId: assign({ hookId: undefined }),
    // Type-safe action that only sets scope from START_CONTINUATION events
    setContinuationScope: assign(({ event }) => {
      if (event.type === LoginSessionEventType.START_CONTINUATION) {
        return { continuationScope: event.scope };
      }
      return {};
    }),
    clearContinuationScope: assign({ continuationScope: undefined }),
    // Type-safe action that only sets reason from FAIL events
    setFailureReason: assign(({ event }) => {
      if (event.type === LoginSessionEventType.FAIL) {
        return { failureReason: event.reason };
      }
      return {};
    }),
  },
}).createMachine({
  id: "loginSession",
  initial: LoginSessionState.PENDING,
  context: {},
  states: {
    [LoginSessionState.PENDING]: {
      on: {
        [LoginSessionEventType.AUTHENTICATE]: {
          target: LoginSessionState.AUTHENTICATED,
          actions: "setUserId",
        },
        [LoginSessionEventType.FAIL]: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        [LoginSessionEventType.EXPIRE]: {
          target: LoginSessionState.EXPIRED,
        },
      },
    },
    [LoginSessionState.AUTHENTICATED]: {
      on: {
        [LoginSessionEventType.REQUIRE_EMAIL_VERIFICATION]: {
          target: LoginSessionState.AWAITING_EMAIL_VERIFICATION,
        },
        [LoginSessionEventType.START_HOOK]: {
          target: LoginSessionState.AWAITING_HOOK,
          actions: "setHookId",
        },
        [LoginSessionEventType.START_CONTINUATION]: {
          target: LoginSessionState.AWAITING_CONTINUATION,
          actions: "setContinuationScope",
        },
        [LoginSessionEventType.COMPLETE]: {
          target: LoginSessionState.COMPLETED,
        },
        [LoginSessionEventType.FAIL]: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        [LoginSessionEventType.EXPIRE]: {
          target: LoginSessionState.EXPIRED,
        },
      },
    },
    [LoginSessionState.AWAITING_EMAIL_VERIFICATION]: {
      on: {
        // Return to AUTHENTICATED hub to check if more steps are needed
        // Also support COMPLETE for backward compatibility (direct completion)
        [LoginSessionEventType.COMPLETE]: {
          target: LoginSessionState.AUTHENTICATED,
        },
        [LoginSessionEventType.FAIL]: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        [LoginSessionEventType.EXPIRE]: {
          target: LoginSessionState.EXPIRED,
        },
      },
    },
    [LoginSessionState.AWAITING_HOOK]: {
      on: {
        // Return to AUTHENTICATED hub to check if more steps are needed
        [LoginSessionEventType.COMPLETE_HOOK]: {
          target: LoginSessionState.AUTHENTICATED,
          actions: "clearHookId",
        },
        // Allow transitioning to continuation (e.g., form redirects to change-email page)
        [LoginSessionEventType.START_CONTINUATION]: {
          target: LoginSessionState.AWAITING_CONTINUATION,
          actions: "setContinuationScope",
        },
        [LoginSessionEventType.FAIL]: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        [LoginSessionEventType.EXPIRE]: {
          target: LoginSessionState.EXPIRED,
        },
      },
    },
    [LoginSessionState.AWAITING_CONTINUATION]: {
      on: {
        // Return to AUTHENTICATED hub to check if more steps are needed
        [LoginSessionEventType.COMPLETE_CONTINUATION]: {
          target: LoginSessionState.AUTHENTICATED,
          actions: "clearContinuationScope",
        },
        [LoginSessionEventType.FAIL]: {
          target: LoginSessionState.FAILED,
          actions: "setFailureReason",
        },
        [LoginSessionEventType.EXPIRE]: {
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
 * Create a snapshot from a state value for use with getNextSnapshot
 */
function createSnapshot(
  stateValue: LoginSessionState,
  context: LoginSessionContext = {},
) {
  // Use resolveState to create a properly structured snapshot
  // This is the XState v5 way to create a snapshot from state value
  return loginSessionMachine.resolveState({
    value: stateValue,
    context,
  });
}

/**
 * Transition a login session and return the new state
 *
 * Uses XState's getNextSnapshot for a single source of truth - the machine
 * definition determines all valid transitions.
 */
export function transitionLoginSession(
  currentState: LoginSessionState,
  event: LoginSessionEvent,
  context: LoginSessionContext = {},
): { state: LoginSessionState; context: Partial<LoginSessionContext> } {
  const currentSnapshot = createSnapshot(currentState, context);
  const nextSnapshot = getNextSnapshot(
    loginSessionMachine,
    currentSnapshot,
    event,
  );

  // Calculate context diff (what changed)
  const contextDiff: Partial<LoginSessionContext> = {};
  const newContext = nextSnapshot.context;
  const oldContext = context;

  if (newContext.userId !== oldContext.userId) {
    contextDiff.userId = newContext.userId;
  }
  if (newContext.hookId !== oldContext.hookId) {
    contextDiff.hookId = newContext.hookId;
  }
  if (newContext.continuationScope !== oldContext.continuationScope) {
    contextDiff.continuationScope = newContext.continuationScope;
  }
  if (newContext.failureReason !== oldContext.failureReason) {
    contextDiff.failureReason = newContext.failureReason;
  }

  return {
    state: nextSnapshot.value as LoginSessionState,
    context: contextDiff,
  };
}

/**
 * Check if a login session can transition with the given event
 *
 * Uses XState's getNextSnapshot - if the state changes, the transition is valid.
 */
export function canTransition(
  currentState: LoginSessionState,
  eventType: LoginSessionEvent["type"],
  context: LoginSessionContext = {},
): boolean {
  // Create a minimal event for checking (some events need required properties)
  let event: LoginSessionEvent;
  switch (eventType) {
    case LoginSessionEventType.AUTHENTICATE:
      event = { type: eventType, userId: "" };
      break;
    case LoginSessionEventType.START_CONTINUATION:
      event = { type: eventType, scope: [] };
      break;
    case LoginSessionEventType.FAIL:
      event = { type: eventType, reason: "" };
      break;
    default:
      event = { type: eventType } as LoginSessionEvent;
  }

  const currentSnapshot = createSnapshot(currentState, context);
  const nextSnapshot = getNextSnapshot(
    loginSessionMachine,
    currentSnapshot,
    event,
  );

  // Transition is valid if state changed
  return nextSnapshot.value !== currentState;
}

/**
 * Helper to transition from a LoginSession object
 */
export function transitionLoginSessionFromEntity(
  loginSession: LoginSession,
  event: LoginSessionEvent,
): { state: LoginSessionState; context: Partial<LoginSessionContext> } {
  // Parse existing context from state_data if available
  let existingContext: LoginSessionContext = {};
  if (loginSession.state_data) {
    try {
      existingContext = JSON.parse(loginSession.state_data);
    } catch {
      // Ignore parse errors
    }
  }

  return transitionLoginSession(
    loginSession.state || LoginSessionState.PENDING,
    event,
    existingContext,
  );
}

/**
 * Get valid events for a given state
 */
export function getValidEvents(
  currentState: LoginSessionState,
): LoginSessionEventType[] {
  const allEvents = Object.values(LoginSessionEventType);
  return allEvents.filter((eventType) =>
    canTransition(currentState, eventType),
  );
}
