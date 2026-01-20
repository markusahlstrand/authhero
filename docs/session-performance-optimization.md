# Session Tables Performance Optimization - Implementation Plan

## Overview

This document outlines the changes needed to improve the performance of the three session tables:
- `login_sessions`
- `sessions`
- `refresh_tokens`

## Changes Summary

### 1. Database Schema Changes (Migration)

**File**: `packages/kysely/migrate/migrations/2026-01-15T10:00:00_session_performance_optimization.ts`

| Change | Before | After | Benefit |
|--------|--------|-------|---------|
| Date storage | varchar(35) ISO strings | bigint (Unix ms) | 4x smaller, faster comparisons |
| tenant_id size | varchar(255) | varchar(191) | MySQL InnoDB utf8mb4 index compatibility |
| id columns | varchar(21) | varchar(26) | ULID support (26 chars vs nanoid 21 chars) |
| session_id refs | varchar(21) | varchar(26) | Consistency with id columns |
| csrf_token | varchar(21) | varchar(26) | Consistency with id columns |
| user_id index on sessions | ❌ | ✅ | Efficient user-based cleanup |
| user_id index on refresh_tokens | ❌ | ✅ | Efficient user-based cleanup |
| session_id index on refresh_tokens | ❌ | ✅ | Fast session→refresh_token lookups |
| expires_at indexes | ❌ | ✅ | Efficient expiration queries |

### 2. Adapter Layer Changes

The adapter interface stays unchanged (uses ISO strings), but the Kysely adapter needs to convert:
- On **write**: ISO string → Unix timestamp (bigint)
- On **read**: Unix timestamp (bigint) → ISO string

**Helper File**: `packages/kysely/src/utils/dateConversion.ts` (created)

### 3. Files That Need Updates

#### Sessions Adapter
- `packages/kysely/src/sessions/create.ts` - Convert dates on insert
- `packages/kysely/src/sessions/get.ts` - Convert dates on read
- `packages/kysely/src/sessions/list.ts` - Convert dates on read
- `packages/kysely/src/sessions/update.ts` - Convert dates on update

#### Login Sessions Adapter
- `packages/kysely/src/loginSessions/create.ts` - Convert dates on insert
- `packages/kysely/src/loginSessions/get.ts` - Convert dates on read
- `packages/kysely/src/loginSessions/update.ts` - Convert dates on update

#### Refresh Tokens Adapter
- `packages/kysely/src/refreshTokens/create.ts` - Convert dates on insert
- `packages/kysely/src/refreshTokens/get.ts` - Convert dates on read
- `packages/kysely/src/refreshTokens/list.ts` - Convert dates on read
- `packages/kysely/src/refreshTokens/update.ts` - Convert dates on update

#### Cleanup Logic
- `packages/kysely/src/cleanup.ts` - Use numeric comparisons instead of string

#### Database Types
- `packages/kysely/src/db.ts` - Update SQL schema types to use number for dates

### 4. Drizzle Schema Updates

**File**: `packages/drizzle/src/schema/sqlite/sessions.ts`

Change all date columns from `text` to `integer` (SQLite uses integer for bigint):

```typescript
// Before
created_at: text("created_at", { length: 35 }).notNull(),

// After  
created_at: integer("created_at", { mode: "number" }).notNull(),
```

### 5. ULID Migration (Application Level)

ULIDs can coexist with existing nanoids since both fit in varchar(21). To migrate:

1. Add `ulid` package to dependencies
2. Update ID generation in:
   - `packages/kysely/src/loginSessions/create.ts` - Use `ulid()` instead of `nanoid()`
   - `packages/authhero/src/authentication-flows/common.ts` - Use `ulid()` for session/refresh token IDs
   - `packages/authhero/src/authentication-flows/universal.ts` - Use `ulid()` for login session IDs

**Why ULID?**
- Lexicographically sortable by time (timestamp prefix)
- Same 26-character base32 encoding fits in varchar(21) with custom alphabet
- Or use 21-character variant that matches current varchar(21) constraint

**Alternative**: Keep nanoid for IDs but add `created_at` index for time-based ordering

### 6. Improved Cleanup Logic

**Current Issues**:
```typescript
// Slow: NOT IN subquery
.where("id", "not in", db.selectFrom("refresh_tokens").select("session_id"))
```

**Recommended Approach**:
```typescript
// Use LEFT JOIN to find orphaned sessions efficiently
const orphanedSessions = await db
  .selectFrom("sessions as s")
  .leftJoin("refresh_tokens as rt", "rt.session_id", "s.id")
  .where("s.expires_at", "<", Date.now() - oneWeekMs)
  .where("rt.id", "is", null)  // No matching refresh tokens
  .select("s.id")
  .limit(10000)
  .execute();
```

**Cleanup Order** (respecting relationships):
1. Delete expired `refresh_tokens` 
2. Delete `sessions` that are expired AND have no refresh_tokens
3. Delete `login_sessions` that are expired AND have no sessions

### 7. tenant_id Size

The migration reduces `tenant_id` from `varchar(255)` to `varchar(191)` on all three tables. This is important for MySQL InnoDB with utf8mb4 encoding where the maximum index key length is 767 bytes (191 × 4 = 764 bytes).

**Note**: Ensure no existing tenant_ids exceed 191 characters before running the migration.

## Implementation Order

1. **Phase 1: Migration & Utilities**
   - Create date conversion utilities ✅ (done)
   - Create database migration ✅ (done)

2. **Phase 2: Update Kysely Adapters**
   - Update `db.ts` schema types
   - Update all session-related adapters to use conversion utilities

3. **Phase 3: Update Drizzle Schema**
   - Update column types in `packages/drizzle/src/schema/sqlite/sessions.ts`

4. **Phase 4: Update Cleanup Logic**
   - Rewrite cleanup to use numeric comparisons
   - Use LEFT JOIN instead of NOT IN

5. **Phase 5: ULID Migration (Optional)**
   - Add ulid dependency
   - Update ID generation in authentication flows

## Testing Checklist

- [ ] Run existing tests after migration
- [ ] Verify date conversion works correctly (ISO ↔ timestamp)
- [ ] Test cleanup logic with mixed old/new data
- [ ] Verify adapter interface behavior is unchanged
- [ ] Load test cleanup queries on large datasets
- [ ] Verify indexes are being used (EXPLAIN QUERY PLAN)

## Rollback Plan

The migration includes a `down()` function that:
1. Drops new indexes
2. Converts bigint dates back to ISO strings
3. Restores varchar columns

## Estimated Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Date column size | 24-35 bytes | 8 bytes | 3-4x smaller |
| Date comparison | String (slow) | Numeric (fast) | ~10x faster |
| Cleanup query | NOT IN subquery | LEFT JOIN | Much faster |
| User cleanup | Full table scan | Index scan | O(n) → O(log n) |
