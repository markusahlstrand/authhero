# Login Session State Machine Implementation

## Overview

This document describes the XState-based state machine for tracking login session progress. It provides better visibility, debugging capabilities, and clear state transitions for the authentication flow.

## State Machine

### States

```typescript
enum LoginSessionState {
  /** Initial state - awaiting user authentication */
  PENDING = "pending",
  /** User credentials validated, session created */
  AUTHENTICATED = "authenticated",
  /** Waiting for email verification */
  AWAITING_EMAIL_VERIFICATION = "awaiting_email_verification",
  /** Waiting for hook/flow completion (form, page redirect) */
  AWAITING_HOOK = "awaiting_hook",
  /** Tokens issued successfully */
  COMPLETED = "completed",
  /** Authentication failed (wrong password, blocked, etc.) */
  FAILED = "failed",
  /** Session timed out */
  EXPIRED = "expired",
}
```

### State Flow Diagram

```
                              ┌─────────────────────────────────────┐
                              │                                     │
                              ▼                                     │
┌─────────┐  AUTHENTICATE  ┌──────────────┐  START_HOOK  ┌─────────────────┐
│ PENDING │───────────────▶│ AUTHENTICATED │────────────▶│  AWAITING_HOOK  │
└─────────┘                └──────────────┘              └─────────────────┘
     │                           │    │                         │
     │ FAIL                      │    │ REQUIRE_EMAIL_          │ COMPLETE_HOOK
     │                           │    │ VERIFICATION            │
     ▼                           │    ▼                         ▼
┌──────────┐                     │  ┌────────────────────────┐  │
│  FAILED  │◀────────────────────┼──│AWAITING_EMAIL_VERIFY   │  │
└──────────┘                     │  └────────────────────────┘  │
                                 │             │                │
                                 │  COMPLETE   │ COMPLETE       │
                                 ▼             ▼                │
                           ┌───────────┐◀──────────────────────┘
                           │ COMPLETED │
                           └───────────┘

Any state can transition to FAILED or EXPIRED
```

### Events

| Event                        | Description                                   |
| ---------------------------- | --------------------------------------------- |
| `AUTHENTICATE`               | User credentials validated, session created   |
| `REQUIRE_EMAIL_VERIFICATION` | Email verification required before completion |
| `START_HOOK`                 | Redirecting to form, page, or external URL    |
| `COMPLETE_HOOK`              | Returned from hook, back to authenticated     |
| `COMPLETE`                   | Tokens successfully issued                    |
| `FAIL`                       | Authentication failed                         |
| `EXPIRE`                     | Session timed out                             |

### Valid Transitions

| From State                    | Valid Events                                                             |
| ----------------------------- | ------------------------------------------------------------------------ |
| `PENDING`                     | `AUTHENTICATE`, `FAIL`, `EXPIRE`                                         |
| `AUTHENTICATED`               | `REQUIRE_EMAIL_VERIFICATION`, `START_HOOK`, `COMPLETE`, `FAIL`, `EXPIRE` |
| `AWAITING_EMAIL_VERIFICATION` | `COMPLETE`, `FAIL`, `EXPIRE`                                             |
| `AWAITING_HOOK`               | `COMPLETE_HOOK`, `COMPLETE`, `FAIL`, `EXPIRE`                            |
| `COMPLETED`                   | (final state)                                                            |
| `FAILED`                      | (final state)                                                            |
| `EXPIRED`                     | (final state)                                                            |

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

// Mark session as completed (tokens issued)
await completeLoginSession(ctx, tenantId, loginSession);
```

## Where State Transitions Occur

### AUTHENTICATE

- `createSession()` in `common.ts` - when session is created after credential validation

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
