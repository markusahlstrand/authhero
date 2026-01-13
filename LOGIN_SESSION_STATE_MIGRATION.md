# Login Session State Machine Implementation

## Overview

This document describes the XState-based state machine for tracking login session progress. It provides better visibility, debugging capabilities, and clear state transitions for the authentication flow.

The state machine uses XState v5's `getNextSnapshot` for a **single source of truth** - all transitions are defined in the machine definition, and helper functions derive valid transitions from it.

## Architecture: Hub Pattern

The `AUTHENTICATED` state acts as a "hub" that decides the next step. After completing verification, hooks, or continuations, the flow returns to `AUTHENTICATED` so the backend can check if additional steps are needed.

```
Flow examples:
  pending → authenticated → completed (simple login)
  pending → authenticated → awaiting_email_verification → authenticated → completed
  pending → authenticated → awaiting_hook → authenticated → awaiting_continuation → authenticated → completed
```

This enables **chaining**: email verification → hook → another hook → continuation → completed

## States

```typescript
enum LoginSessionState {
  /** Initial state - awaiting user authentication */
  PENDING = "pending",
  /** User credentials validated, session created - HUB state that decides next steps */
  AUTHENTICATED = "authenticated",
  /** Waiting for email verification */
  AWAITING_EMAIL_VERIFICATION = "awaiting_email_verification",
  /** Waiting for hook/flow completion (form, page redirect, impersonate) */
  AWAITING_HOOK = "awaiting_hook",
  /** Waiting for user to complete action on account page (change-email, etc.) */
  AWAITING_CONTINUATION = "awaiting_continuation",
  /** Tokens issued successfully */
  COMPLETED = "completed",
  /** Authentication failed (wrong password, blocked, etc.) */
  FAILED = "failed",
  /** Session timed out */
  EXPIRED = "expired",
}
```

## State Flow Diagram

```
                                       START_CONTINUATION
                              ┌─────────────────────────────────────────────────────────┐
                              │                                                         │
                              ▼                                                         │
┌─────────┐  AUTHENTICATE  ┌──────────────┐  START_HOOK  ┌─────────────────┐            │
│ PENDING │───────────────▶│ AUTHENTICATED │────────────▶│  AWAITING_HOOK  │            │
└─────────┘                └──────────────┘              └─────────────────┘            │
     │                      ▲    │    │ ▲                        │                      │
     │ FAIL                 │    │    │ │ COMPLETE_HOOK          │ FAIL                 │
     │                      │    │    │ └────────────────────────┘                      │
     ▼                      │    │    │                                                 │
┌──────────┐                │    │    │ REQUIRE_EMAIL_                                  │
│  FAILED  │◀───────────────┼────┼────│ VERIFICATION                                    │
└──────────┘                │    │    ▼                                                 │
                            │    │  ┌────────────────────────┐                          │
    COMPLETE                │    │  │AWAITING_EMAIL_VERIFY   │                          │
       │                    │    │  └────────────────────────┘                          │
       │                    │    │             │                                        │
       ▼                    │    │  COMPLETE   │                                        │
┌───────────┐               │    │             │                                        │
│ COMPLETED │               │    └─────────────┴────────────────────────────────────────┤
└───────────┘               │                                                           │
                            │                  ┌────────────────────────┐               │
                            │                  │ AWAITING_CONTINUATION  │◀──────────────┘
                            │                  └────────────────────────┘
                            │                             │
                            │  COMPLETE_CONTINUATION      │
                            └─────────────────────────────┘

Any non-final state can transition to FAILED or EXPIRED
```

## Events

| Event                        | Description                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `AUTHENTICATE`               | User credentials validated, session created                                         |
| `REQUIRE_EMAIL_VERIFICATION` | Email verification required before completion                                       |
| `START_HOOK`                 | Redirecting to form, page, or external URL                                          |
| `COMPLETE_HOOK`              | Returned from hook → back to AUTHENTICATED hub                                      |
| `START_CONTINUATION`         | Redirecting to account page (change-email, etc.)                                    |
| `COMPLETE_CONTINUATION`      | Returned from account page → back to AUTHENTICATED hub                              |
| `COMPLETE`                   | Tokens successfully issued (only from AUTHENTICATED or AWAITING_EMAIL_VERIFICATION) |
| `FAIL`                       | Authentication failed                                                               |
| `EXPIRE`                     | Session timed out                                                                   |

## Valid Transitions

| From State                    | Valid Events                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `PENDING`                     | `AUTHENTICATE`, `FAIL`, `EXPIRE`                                                               |
| `AUTHENTICATED`               | `REQUIRE_EMAIL_VERIFICATION`, `START_HOOK`, `START_CONTINUATION`, `COMPLETE`, `FAIL`, `EXPIRE` |
| `AWAITING_EMAIL_VERIFICATION` | `COMPLETE` (→ AUTHENTICATED), `FAIL`, `EXPIRE`                                                 |
| `AWAITING_HOOK`               | `COMPLETE_HOOK` (→ AUTHENTICATED), `FAIL`, `EXPIRE`                                            |
| `AWAITING_CONTINUATION`       | `COMPLETE_CONTINUATION` (→ AUTHENTICATED), `FAIL`, `EXPIRE`                                    |
| `COMPLETED`                   | (final state)                                                                                  |
| `FAILED`                      | (final state)                                                                                  |
| `EXPIRED`                     | (final state)                                                                                  |

**Important**: `AWAITING_HOOK` does NOT accept `COMPLETE` - you must use `COMPLETE_HOOK` which returns to `AUTHENTICATED`, then `COMPLETE` from there.

## Database Schema

### New Columns

| Column           | Type           | Description                          |
| ---------------- | -------------- | ------------------------------------ |
| `state`          | `varchar(50)`  | Current state, defaults to "pending" |
| `state_data`     | `text`         | JSON context (e.g., hook ID)         |
| `failure_reason` | `text`         | Error message if failed              |
| `user_id`        | `varchar(255)` | Set once user is authenticated       |

### Indexes

- `login_sessions_state_idx` on `(state)` - efficient state queries
- `login_sessions_state_updated_idx` on `(state, updated_at)` - finding stuck sessions
- `login_sessions_tenant_user_idx` on `(tenant_id, user_id)` - user session lookups

## Helper Functions

Located in `packages/authhero/src/authentication-flows/common.ts`:

```typescript
// Mark session as failed
await failLoginSession(ctx, tenantId, loginSession, "Wrong password");

// Mark session as awaiting hook (before redirect)
await startLoginSessionHook(ctx, tenantId, loginSession, "form:mfa");

// Mark session as returned from hook
await completeLoginSessionHook(ctx, tenantId, loginSession);

// Mark session as awaiting continuation (before redirecting to account page)
await startLoginSessionContinuation(
  ctx,
  tenantId,
  loginSession,
  ["/u/account/change-email"],
  returnUrl,
);

// Mark session as returned from continuation (account page)
await completeLoginSessionContinuation(ctx, tenantId, loginSession);

// Mark session as completed (tokens issued)
await completeLoginSession(ctx, tenantId, loginSession);
```

## Where State Transitions Occur

### AUTHENTICATE

- `authenticateLoginSession()` in `common.ts` - the single source of truth for authentication
- Called automatically by `createFrontChannelAuthResponse()` when state is PENDING
- Creates or links a session and transitions to AUTHENTICATED

### FAIL

- `password.ts` - wrong password, blocked user, unverified email, user not found

### START_HOOK

- `hooks/index.ts` - `onExecutePostLogin` redirect
- `hooks/formhooks.ts` - form hook redirect
- `hooks/pagehooks.ts` - page hook redirect

### COMPLETE_HOOK

- `flow-api.ts` - form flow completion
- `form-node.tsx` - form node completion
- `screen-api.ts` - screen completion

### COMPLETE

- `completeLogin()` in `common.ts` - when tokens are issued

## State as Single Source of Truth

The login session state is the **single source of truth** for where a login flow is in its lifecycle.
Code should check the state rather than checking if `session_id` or `user_id` is set.

```typescript
// ❌ Bad: Checking properties instead of state
if (loginSession.session_id) {
  // Assume authenticated
}

// ✅ Good: Checking state
if (loginSession.state === LoginSessionState.AUTHENTICATED) {
  // Actually authenticated
}
```

The `createFrontChannelAuthResponse()` function enforces this by:

1. Re-fetching the login session to get current state
2. Rejecting terminal states (COMPLETED, FAILED, EXPIRED)
3. Calling `authenticateLoginSession()` if state is PENDING
4. Using the session_id from the login session if already AUTHENTICATED

## Usage Examples

### Finding Stuck Sessions

```sql
-- Sessions stuck in a hook for over 5 minutes
SELECT id, state, state_data, updated_at
FROM login_sessions
WHERE state = 'awaiting_hook'
AND updated_at < NOW() - INTERVAL '5 minutes';
```

### Analytics

```sql
-- State distribution
SELECT state, COUNT(*)
FROM login_sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY state;

-- Failed login reasons
SELECT failure_reason, COUNT(*)
FROM login_sessions
WHERE state = 'failed'
GROUP BY failure_reason
ORDER BY COUNT(*) DESC;
```

### Checking Session State

```typescript
import { LoginSessionState } from "@authhero/adapter-interfaces";

// Check if authenticated
if (loginSession.state === LoginSessionState.AUTHENTICATED) {
  // User is authenticated but tokens not yet issued
}

// Check if waiting for hook
if (loginSession.state === LoginSessionState.AWAITING_HOOK) {
  // Session is waiting for form/page completion
  const hookData = JSON.parse(loginSession.state_data || "{}");
  console.log("Waiting for:", hookData.hookId);
}
```

## Files Modified

### Type System

- `packages/adapter-interfaces/src/types/LoginSession.ts` - enum and schema

### State Machine

- `packages/authhero/src/state-machines/login-session.ts` - XState machine and pure transition functions
- `packages/authhero/test/state-machines/login-session.spec.ts` - 22 tests

### Authentication Flows

- `packages/authhero/src/authentication-flows/common.ts` - helper functions, state transitions
- `packages/authhero/src/authentication-flows/password.ts` - FAIL transitions

### Hooks

- `packages/authhero/src/hooks/index.ts` - START_HOOK on post-login redirect
- `packages/authhero/src/hooks/formhooks.ts` - START_HOOK before form redirect
- `packages/authhero/src/hooks/pagehooks.ts` - START_HOOK before page redirect

### Form/Screen Completion

- `packages/authhero/src/routes/universal-login/flow-api.ts` - COMPLETE_HOOK
- `packages/authhero/src/routes/universal-login/form-node.tsx` - COMPLETE_HOOK
- `packages/authhero/src/routes/universal-login/screen-api.ts` - COMPLETE_HOOK

### Database

- `packages/kysely/migrate/migrations/2026-01-10T10:00:00_login_session_state.ts`
- `packages/kysely/src/db.ts`
- `packages/kysely/src/loginSessions/create.ts`
- `packages/kysely/src/loginSessions/get.ts`
- `packages/drizzle/src/schema/sqlite/sessions.ts`
- `packages/aws/src/adapters/loginSessions.ts`
