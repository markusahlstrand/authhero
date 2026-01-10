# Login Session State Machine - Phase 1 Implementation

## Overview

This is the first phase of migrating from a simple `login_completed` boolean flag to a proper state machine for tracking login session progress. This provides better visibility, debugging capabilities, and sets the foundation for XState integration.

## Changes Made

### 1. **Type System Updates** (`adapter-interfaces`)

Added new state enum and fields to `LoginSession`:

```typescript
enum LoginSessionState {
  PENDING = "pending",
  VALIDATING_ORG = "validating_org", 
  CALCULATING_PERMISSIONS = "calculating_permissions",
  UPDATING_METADATA = "updating_metadata",
  CREATING_SESSION = "creating_session",
  CREATING_REFRESH_TOKEN = "creating_refresh_token",
  RUNNING_HOOKS = "running_hooks",
  ISSUING_TOKENS = "issuing_tokens",
  COMPLETED = "completed",
  FAILED = "failed",
  REDIRECTED = "redirected",
  EXPIRED = "expired",
}
```

New fields added to `LoginSession`:
- `state: LoginSessionState` - Current state (defaults to "pending")
- `state_data?: string` - JSON-serialized state machine context
- `failure_reason?: string` - Error message if state is "failed"

**Backwards Compatibility**: The `login_completed` boolean is kept for now.

### 2. **Database Migration** (`kysely`)

Created migration: `2026-01-10T10:00:00_login_session_state.ts`

- Adds three new columns: `state`, `state_data`, `failure_reason`
- Backfills existing data:
  - `login_completed = 1` → `state = 'completed'`
  - `expires_at < NOW()` → `state = 'expired'`
  - Otherwise → `state = 'pending'`
- Adds indexes for efficient querying:
  - `login_sessions_state_idx` on `state`
  - `login_sessions_state_updated_idx` on `(state, updated_at)`

### 3. **Database Adapters Updated**

**Kysely** (`packages/kysely/src/`):
- Updated schema in `db.ts`
- Modified `create()` to set state fields
- Modified `get()` to return state fields

**Drizzle** (`packages/drizzle/src/schema/sqlite/sessions.ts`):
- Added state columns to schema

**AWS DynamoDB** (`packages/aws/src/adapters/loginSessions.ts`):
- Updated `LoginSessionItem` interface
- Modified create operation to include state

### 4. **Helper Functions** (`authhero/src/helpers/login-session-state.ts`)

Backwards-compatible utility functions:

```typescript
// Check if login is completed (uses state if available, falls back to login_completed)
isLoginCompleted(loginSession): boolean

// Check if login has failed
isLoginFailed(loginSession): boolean

// Check if login is still in progress
isLoginInProgress(loginSession): boolean

// Check if login has expired
isLoginExpired(loginSession): boolean

// Get human-readable state description
getLoginStateDescription(loginSession): string
```

## Benefits

### Immediate Improvements

1. **Better Debugging**: Know exactly where a login is stuck
   ```sql
   SELECT id, state, updated_at 
   FROM login_sessions 
   WHERE state = 'creating_refresh_token' 
   AND updated_at < NOW() - INTERVAL '5 minutes';
   -- Shows logins stuck at this specific step
   ```

2. **Rich Analytics**: Understand login flow performance
   ```sql
   SELECT state, COUNT(*), AVG(duration) 
   FROM login_sessions 
   GROUP BY state;
   ```

3. **Explicit Failure Tracking**: `failure_reason` provides context

4. **Backwards Compatible**: Existing code using `login_completed` continues to work

### Foundation for Future Work

This sets up for:
- **Phase 2**: XState integration in `completeLogin()` and `createFrontChannelAuthResponse()`
- **Phase 3**: Compensation/rollback logic for consistency
- **Phase 4**: Resumable login flows

## Migration Path

### Current State (Phase 1) ✅

- State columns added to database
- All adapters updated
- Helper functions available
- `login_completed` still present and functional

### Next Steps (Phase 2)

- Integrate XState into `completeLogin()` function
- Update state as login progresses through each step
- Add state persistence in state_data

### Future (Phase 3)

- Track created resources in `state_data`
- Add rollback logic for failed states
- Eventually deprecate and remove `login_completed`

## Usage Examples

### Checking Login Status (New Way)

```typescript
import { LoginSessionState, isLoginCompleted } from '@authhero/adapter-interfaces';

// Instead of:
if (loginSession.login_completed) { ... }

// Use:
if (isLoginCompleted(loginSession)) { ... }
// or
if (loginSession.state === LoginSessionState.COMPLETED) { ... }
```

### Finding Stuck Logins

```typescript
// Old way - can't tell if stuck or in progress
const incomplete = await loginSessions.list({ 
  where: { login_completed: false } 
});

// New way - precisely identify stuck logins
const stuck = await loginSessions.list({
  where: { 
    state: ['creating_session', 'running_hooks'],
    updated_at: { lt: fiveMinutesAgo }
  }
});
```

### User-Facing Error Messages

```typescript
import { getLoginStateDescription } from '@authhero/authhero';

const message = getLoginStateDescription(loginSession);
// "Running post-login hooks" or "Login failed: User not in organization"
```

## Testing

After migration, verify:

1. **Backfill worked correctly**:
   ```sql
   SELECT state, COUNT(*) FROM login_sessions GROUP BY state;
   ```

2. **New logins get proper state**:
   - Create a new login session
   - Verify `state = 'pending'`

3. **Backwards compatibility**:
   - Code checking `login_completed` still works
   - Helper functions work for both old and new records

## Files Modified

- `packages/adapter-interfaces/src/types/LoginSession.ts`
- `packages/adapter-interfaces/src/index.ts`
- `packages/kysely/migrate/migrations/2026-01-10T10:00:00_login_session_state.ts`
- `packages/kysely/migrate/migrations/index.ts`
- `packages/kysely/src/db.ts`
- `packages/kysely/src/loginSessions/create.ts`
- `packages/kysely/src/loginSessions/get.ts`
- `packages/drizzle/src/schema/sqlite/sessions.ts`
- `packages/aws/src/adapters/loginSessions.ts`
- `packages/authhero/src/helpers/login-session-state.ts` (new)
- `packages/adapter-interfaces/src/exports-login-session.ts` (new)
