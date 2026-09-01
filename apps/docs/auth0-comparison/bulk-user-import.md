# Bulk user import

AuthHero implements Auth0's bulk user-import job API, so a migration script written against Auth0 works against AuthHero by changing only the base URL:

- `POST /api/v2/jobs/users-imports` — submit a file of users
- `GET /api/v2/jobs/{id}` — poll the job
- `GET /api/v2/jobs/{id}/errors` — read per-user failures

The `auth0` npm client's `jobs.importUsers()`, `jobs.get()` and `jobs.errors()` work unmodified.

Use this when you already hold your users' password hashes and want to own the records upfront. If you cannot extract hashes, use [lazy migration](/auth0-comparison/lazy-migration) instead — it drains the upstream tenant incrementally and needs no hashes at all. The two are complementary: importing profiles in bulk and leaving `import_mode` on for passwords is a perfectly good combination.

## Submitting a job

```bash
curl -X POST https://auth.example.com/api/v2/jobs/users-imports \
  -H "Authorization: Bearer $TOKEN" \
  -F users=@users.json \
  -F connection_id=con_abc123 \
  -F upsert=true \
  -F external_id=batch-0042
```

| Field                   | Notes                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                 | JSON file: an array of user objects (see below). Max 500 KB by default.                                                                                    |
| `connection_id`         | The database connection to import into. Required.                                                                                                          |
| `upsert`                | When `true`, update users matching on `user_id`, `email`, `username` or `phone_number`. Defaults to `false`, which makes an existing user a per-row error. |
| `external_id`           | Your own correlation id, echoed back on the job.                                                                                                           |
| `send_completion_email` | Accepted for compatibility; not yet delivered.                                                                                                             |

The response is `202` with the job:

```json
{
  "id": "job_op_3kf9...",
  "type": "users_import",
  "status": "pending",
  "connection_id": "con_abc123",
  "external_id": "batch-0042",
  "percentage_done": 0,
  "summary": { "total": 1000, "inserted": 0, "updated": 0, "failed": 0 }
}
```

Poll `GET /api/v2/jobs/{id}` until `status` is `completed` or `failed`. `percentage_done` and `time_left_seconds` are estimated from actual throughput.

## The import file

```json
[
  {
    "email": "jane@example.com",
    "email_verified": true,
    "user_id": "abc123",
    "username": "jane",
    "name": "Jane Doe",
    "app_metadata": { "plan": "pro" },
    "user_metadata": { "theme": "dark" },
    "custom_password_hash": {
      "algorithm": "bcrypt",
      "hash": {
        "value": "$2b$10$C9hB01.YxRSTcn/ZOOo4j.TW7xCKKFKBSF.C7E0xiUwumqIDqWUXG"
      }
    }
  }
]
```

`email` is required. Profile fields (`username`, `name`, `given_name`, `family_name`, `nickname`, `picture`, `phone_number`, `phone_verified`, `blocked`), `app_metadata` and `user_metadata` are supported. Unknown fields are ignored rather than rejected.

A bare `user_id` is prefixed with the tenant's database provider, exactly as Auth0 prefixes with `auth0|`. Supplying `abc123` stores `auth0|abc123`; supplying `auth0|abc123` is not double-prefixed. Omit it and one is generated.

## Passwords: bcrypt only

::: warning
AuthHero verifies passwords with bcrypt, so **bcrypt is the only hash algorithm it can import.**
:::

Both Auth0 forms are accepted:

- `password_hash` — a bcrypt string, `$2a$` or `$2b$`
- `custom_password_hash` — `{ "algorithm": "bcrypt", "hash": { "value": "$2b$..." } }`, where `$2a$`, `$2b$` and `$2y$` are all accepted and `hash.encoding` must be `utf8` if given

Any other algorithm (argon2, pbkdf2, scrypt, sha\*, md5, hmac, ldap) fails **that row only**, with code `UNSUPPORTED_HASH_ALGORITHM`. The rest of the file still imports. This is deliberate: storing a hash AuthHero cannot verify would create a user who can never log in, which is worse than a clear error.

Users whose hashes cannot be imported — and users with no password field at all — are still created as valid accounts. They sign in through a password reset, or through [lazy migration's](/auth0-comparison/lazy-migration) upstream password fallback if you have it enabled. Once a user has a local password, that fallback is skipped, matching Auth0's behaviour of never re-delegating after import.

## Reading errors

```bash
curl https://auth.example.com/api/v2/jobs/job_op_3kf9.../errors \
  -H "Authorization: Bearer $TOKEN"
```

Returns `200` with an array, or `204` when the job produced no errors:

```json
[
  {
    "user": { "email": "bob@example.com", "password_hash": "[redacted]" },
    "errors": [
      {
        "code": "UNSUPPORTED_HASH_ALGORITHM",
        "message": "AuthHero can only import bcrypt password hashes; received \"argon2\".",
        "path": "custom_password_hash.algorithm"
      }
    ]
  }
]
```

The submitted user object is echoed back with credential material redacted — password hashes are never returned over the API.

| Code                         | Meaning                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `VALIDATION_ERROR`           | The entry did not match the schema.                                        |
| `UNSUPPORTED_HASH_ALGORITHM` | A valid hash in an algorithm AuthHero cannot verify.                       |
| `UNSUPPORTED_HASH_FORMAT`    | bcrypt, but a variant (`$2$`, `$2x$`) or encoding that would never verify. |
| `DUPLICATE_ENTRY`            | The same identity appears earlier in the same file.                        |
| `USER_ALREADY_EXISTS`        | The user exists and `upsert` was not enabled.                              |
| `INTERNAL_ERROR`             | The write itself failed.                                                   |

## Importing millions of users

Jobs are **durable and resumable**, which is what makes large migrations safe.

Every user in the file is staged as its own database row before the request returns. Rows are then processed in chunks, and each chunk commits its outcomes before the next begins. If the process handling a job dies — evicted, redeployed, timed out — nothing is lost and nothing is done twice: the unprocessed rows are still marked pending, and the next driver resumes from the last committed chunk.

To guarantee that resumption happens, wire the sweep into your scheduled handler:

```ts
import { resumeUsersImports, runRetention } from "authhero";

export default {
  async scheduled(_event, env) {
    // Picks up any import whose driver died, and carries it to completion.
    await resumeUsersImports(dataAdapter);

    // Deletes finished jobs and their staged rows after 24 hours.
    await runRetention({ dataAdapter });
  },
};
```

Without this the accepting request still makes a start, and any subsequent request or sweep will finish the job — but the scheduled sweep is what bounds how long a stalled job can sit.

### Limits

| Limit                      | Default               | Configurable                                  |
| -------------------------- | --------------------- | --------------------------------------------- |
| File size                  | 500 KB (~1,000 users) | `init({ usersImportMaxBytes })`               |
| Concurrent jobs per tenant | 2                     | `init({ usersImportMaxConcurrentJobs })`      |
| Job data retention         | 24 hours              | `runRetention({ usersImportRetentionHours })` |

The defaults are Auth0's, so an Auth0-shaped client sees identical behaviour. A migration of a million users is therefore ~1,000 jobs of ~1,000 users, submitted two at a time — the same shape as the equivalent Auth0 migration. Raise the limits only for a migration you control end to end; a larger file means more rows staged inside a single request.

Exceeding the concurrency limit returns `429`.

## Required scopes

| Endpoint                          | Scope                          |
| --------------------------------- | ------------------------------ |
| `POST /api/v2/jobs/users-imports` | `create:users`                 |
| `GET /api/v2/jobs/{id}`           | `create:users` or `read:users` |
| `GET /api/v2/jobs/{id}/errors`    | `create:users` or `read:users` |

## Setting it up

There is **no workflow engine, queue, or object storage to configure.** Jobs are durable because their progress is checkpointed in the database, so the only moving parts are your database schema and a cron.

A service already using AuthHero needs three changes.

### 1. Run the migrations (required)

The feature adds a `tenant_operation_rows` table and four columns on `tenant_operations` (`input`, `result`, `claimed_by`, `claim_expires_at`).

- **kysely** — included in `migrateToLatest()`; run your usual migration step.
- **drizzle** — the tables are control-plane, so apply the `drizzle-control-plane/` migration set, not the core `drizzle/` one.

### 2. Make sure the adapters are present (required)

The endpoints need the `tenantOperations` and `tenantOperationRows` adapters. Without them they return `501`.

- **kysely** — registered automatically, nothing to do.
- **drizzle** — only registered when you pass `controlPlane: true`:

  ```ts
  const data = createAdapters(db, {
    useTransactions: true,
    controlPlane: true,
  });
  ```

::: warning Single-database and control-plane deployments only
Job records live in the control-plane tables, so bulk import is available where those tables and the users being imported share a database — a single-database deployment (for example kysely on PlanetScale), or the control plane itself.

It is **not** available on Workers-for-Platforms tenant workers, whose D1s carry only the core schema; those return `501`. Import into such a tenant from the control plane, or use [lazy migration](/auth0-comparison/lazy-migration).
:::

### 3. Wire the sweeps into your scheduled handler (required)

```ts
import { resumeUsersImports, runRetention } from "authhero";

export default {
  async scheduled(_event, env) {
    // Picks up any import whose driver died and carries it to completion.
    // This is what makes a large import reliable — without it, a job whose
    // driver was evicted mid-run waits for the next request to nudge it.
    await resumeUsersImports(dataAdapter);

    // Also deletes finished jobs and their staged rows after 24 hours.
    await runRetention({ dataAdapter });
  },
};
```

Every 1–5 minutes is a reasonable cadence. `resumeUsersImports()` returns `{ scanned, advanced, completed, errors }` if you want to log it, takes the same budget options as a single pass (`maxRows`, `chunkSize`, `deadline`), and is safe to run concurrently with itself — a job already being advanced is left to its current driver.

If you already call `runRetention()`, the 24-hour job cleanup is picked up automatically with no code change.

### 4. Optionally raise the limits

Only if you are running a migration you control end to end:

```ts
const { app } = init({
  dataAdapter,
  usersImportMaxBytes: 5 * 1024 * 1024, // default 500 KB
  usersImportMaxConcurrentJobs: 8, // default 2
});
```

Both default to Auth0's values, so leaving them alone keeps behaviour identical to Auth0 for any client.
