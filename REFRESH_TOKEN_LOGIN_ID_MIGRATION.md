# Refresh Token → Login Session Migration

## Goal

Decouple refresh tokens from sessions so they reference the login session directly via `login_id`, instead of indirectly through `session_id` → `sessions.login_session_id`. This simplifies cleanup of both sessions and refresh tokens.

### Current relationship

```
LoginSession → Session (via login_session_id) → RefreshToken (via session_id)
```

### Target relationship

```
LoginSession → RefreshToken (via login_id)
LoginSession → Session (via login_session_id)
```

---

## Stage 1: Add optional `login_id` — ✅ Complete

Add an optional `login_id` field to refresh tokens and populate it on all newly created tokens. Existing tokens will have `login_id = null`.

### Changes

- **Type definitions**
  - `packages/adapter-interfaces/src/types/RefreshTokens.ts` — Added `login_id: z.string().optional()` to `refreshTokenInsertSchema`
  - `packages/authhero/src/types/GrantFlowResult.ts` — Added optional `login_id` to `GrantFlowResult`

- **Database layer**
  - `packages/drizzle/src/schema/sqlite/sessions.ts` — Added `login_id` column + index to `refresh_tokens` table
  - `packages/kysely/migrate/migrations/2026-03-04T10:00:00_add_login_id_to_refresh_tokens.ts` — Migration: add nullable `login_id` column + index
  - `packages/kysely/migrate/migrations/index.ts` — Registered the migration
  - `packages/kysely/src/refreshTokens/list.ts` — Added `login_id` to Lucene-filterable fields

- **Application logic**
  - `packages/authhero/src/authentication-flows/common.ts` — Added `login_id` to `CreateRefreshTokenParams` and both creation call sites
  - `packages/authhero/src/authentication-flows/authorization-code.ts` — Passes `login_id: loginSession.id` when creating refresh tokens
  - `packages/authhero/src/authentication-flows/refresh-token.ts` — Propagates `login_id` in refresh token grant result

- **Adapters**
  - `packages/aws/src/adapters/refreshTokens.ts` — Added `login_id` to DynamoDB item type and storage

---

## Stage 2: Backfill existing tokens — ⬜ Not started

Write a backfill script/migration to populate `login_id` on existing refresh tokens by joining through `session_id` → `sessions.login_session_id`.

### Plan

- Query `refresh_tokens` where `login_id IS NULL`
- Join with `sessions` on `refresh_tokens.session_id = sessions.id`
- Set `refresh_tokens.login_id = sessions.login_session_id`
- Run in batches to avoid locking issues

---

## Stage 3: Make `login_id` mandatory — ⬜ Not started

Once all existing tokens are backfilled, make `login_id` required and switch application logic to use it.

### Plan

- Change `login_id` from `z.string().optional()` to `z.string()` in the schema
- Update `packages/kysely/src/cleanup.ts` to use `login_id` instead of `session_id` when protecting login sessions from deletion
- Update `packages/authhero/src/routes/auth-api/logout.ts` to query refresh tokens by `login_id` instead of `session_id`
- Update Drizzle schema to mark `login_id` as `.notNull()`
- Create a migration to add `NOT NULL` constraint (once backfill is verified complete)

---

## Stage 4: Remove `session_id` — ⬜ Not started

Remove the now-redundant `session_id` from refresh tokens.

### Plan

- Remove `session_id` from `refreshTokenInsertSchema` and `refreshTokenSchema`
- Remove `session_id` from Drizzle schema, Kysely DB type, and AWS adapter
- Create a migration to drop the `session_id` column and its index
- Remove `session_id` from Lucene-filterable fields in list
- Update any remaining code referencing `refreshToken.session_id`
- Clean up `GrantFlowResult.session_id` if it becomes unused
