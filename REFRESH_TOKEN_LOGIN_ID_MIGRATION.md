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

## Stage 2: Backfill existing tokens — ✅ Complete

Backfill script created to populate `login_id` on existing refresh tokens by joining through `session_id` → `sessions.login_session_id`.

### Changes

- **`scripts/backfill_refresh_token_login_id.sql`** — PlanetScale-compatible SQL script that backfills in 10K-row batches (run ~13 times until 0 rows affected)

---

## Stage 3: Make `login_id` mandatory — ✅ Complete

Made `login_id` required in the schema and updated all application logic to use it instead of `session_id`.

### Changes

- **Type definitions**
  - `packages/adapter-interfaces/src/types/RefreshTokens.ts` — Changed `login_id` from `z.string().optional()` to `z.string()` (required)
  - `packages/authhero/src/authentication-flows/common.ts` — Made `login_id` required in `CreateRefreshTokenParams`, removed `session_id`

- **Application logic**
  - `packages/authhero/src/authentication-flows/authorization-code.ts` — Removed `session_id` from `createRefreshToken` call
  - `packages/authhero/src/authentication-flows/refresh-token.ts` — Resolves `session_id` by looking up login session via `refreshToken.login_id`
  - `packages/authhero/src/routes/auth-api/logout.ts` — Queries refresh tokens by `login_id` (via `session.login_session_id`) instead of `session_id`

- **Cleanup logic**
  - `packages/kysely/src/cleanup.ts` — Step 3 now uses `login_id` from refresh_tokens matched against `login_session_id` on sessions

- **Adapters**
  - `packages/aws/src/adapters/refreshTokens.ts` — Made `login_id` required, removed `session_id` from DynamoDB item

---

## Stage 4: Remove `session_id` — ✅ Complete

Removed the `session_id` column from refresh tokens entirely.

### Changes

- **Type definitions**
  - `packages/adapter-interfaces/src/types/RefreshTokens.ts` — Removed `session_id` from both insert and read schemas

- **Database layer**
  - `packages/kysely/migrate/migrations/2026-03-11T10:00:00_refresh_tokens_replace_session_id_with_login_id.ts` — Migration: make `login_id` NOT NULL, drop `session_id` index, drop `session_id` column
  - `packages/kysely/migrate/migrations/index.ts` — Registered migration as `o034_refresh_tokens_replace_session_id_with_login_id`
  - `packages/drizzle/src/schema/sqlite/sessions.ts` — Removed `session_id` column + index, made `login_id` `.notNull()`
  - `packages/kysely/src/refreshTokens/list.ts` — Removed `session_id` from Lucene-filterable fields

- **Adapters**
  - `packages/aws/src/adapters/refreshTokens.ts` — Removed `session_id` from `RefreshTokenItem` interface and create method

- **Tests**
  - `packages/kysely/test/cleanup.spec.ts` — Updated all refresh token fixtures to use `login_id` instead of `session_id`
  - `packages/authhero/test/routes/auth-api/token.spec.ts` — Updated all refresh token fixtures to use `login_id`
  - `packages/authhero/test/routes/auth-api/logout.spec.ts` — Updated refresh token creation and query assertions to use `login_id`

### Notes

- `GrantFlowResult.session_id` was intentionally kept — it's used for session cookies in the token endpoint, not derived from refresh tokens
