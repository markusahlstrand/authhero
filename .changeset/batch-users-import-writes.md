---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"authhero": minor
---

Batch the bulk user import's row writes, so a large migration is bounded by database throughput rather than round-trip latency. **Two behaviour changes come with it — see the end of this note.**

`advanceUsersImport` processed staged rows strictly one at a time: up to four existence probes, then a user insert, then a password insert, each awaited in turn. Measured against a hosted PlanetScale database that is roughly 400 ms per row — almost entirely waiting — which puts a million-user import somewhere around 55 hours, and gets worse the further the database is from the worker.

A chunk is now parsed and mapped in memory, every existence probe for a given field runs as a single query, and the rows that turn out to be new users are written with one batched insert. A 50-row chunk goes from about 200 queries to about five; a 20-user import now issues zero per-row `users.create` calls.

Probes are deliberately one query per field rather than one query overall. MySQL will not `index_merge` across an `OR` spanning two columns and falls back to a full scan, but an `OR` over a single column resolves as a range scan on that column's index — so `email:"a" OR email:"b"` is fast while mixing fields would not be.

Adds an optional `createMany` to `UserDataAdapter`, implemented by the kysely adapter. It is optional and callers fall back to looping `create`, so adapters that do not implement it keep working unchanged. It writes the users row and its companion password row only — identities, activity counters and outbox events still go through `create`, and a user carrying them is rejected rather than silently written without them.

Three properties the sequential loop provided for free are now explicit, and covered by tests:

- **In-chunk de-duplication.** Two rows sharing an email used to be impossible to double-insert because the second row's probe saw the first row's write. A batch probes everything before writing anything, so the chunk is de-duplicated in memory — on every identifier the probes cover, so a repeated username or phone number is caught too.
- **Per-row error attribution.** Validation and conflict outcomes are decided before any write, so they stay attributed to their own row. If a batch insert fails, the whole chunk is retried row by row so each failure is recorded against the row that caused it.
- **Resume after an interrupted driver.** Rows whose derived id already exists are still recognised as their own earlier write rather than reported as a spurious conflict.

Upserts continue to use the per-row path, and skip chunk-level probing entirely: an upsert changes rows a later row in the same chunk may itself match, so a snapshot taken once per chunk is not equivalent to resolving identity per row. An `upsert: true` import therefore runs at the old cost — the speedup applies to `upsert: false`, which is the shape of a migration.

Also fixes two problems in the existence probe itself, one of them pre-existing:

- **Probe values are escaped properly.** They were interpolated with only their quotes escaped, so a value ending in a backslash could close its own clause and append an `OR` — widening the probe to match an unrelated user. On an `upsert` job that user's row was then overwritten with the imported row's values. Values now go through `escapeLuceneValue`, which escapes backslashes as well.
- **A probe reads as many pages as it needs.** None of the probed fields is unique on its own (email and username are unique only per provider; phone numbers are not unique at all), so several rows can come back for one value and fill a page sized to the number of values, hiding a match for a later value and letting an existing user be treated as new.

## Scope

The speedup requires an adapter that implements `createMany`. Only the kysely adapter does today; drizzle and aws fall back to looping the per-row write and are unchanged.

## Behaviour changes

**A bulk import no longer runs the user registration hooks.** The fresh-user write now goes through `users.rawCreate` on both the batched and per-row paths, so pre-registration denial, hook metadata mutation, built-in email linking and the post-registration outbox event no longer fire for imported users. This matches Auth0, where a users-import job does not trigger Actions.

It is also what keeps the two paths honest: `createMany` is not decorated by `addDataHooks`, so leaving the fallback on the decorated `create` would have made policy enforcement depend on whether the installed adapter implements `createMany`. If you rely on registration hooks firing during an import, this release changes that.

**An imported password is now written in the same call as its user.** Previously the import wrote the user and then made a second `passwords.create` call, so an interrupted driver could leave a user who could not log in until a later sweep repaired them. The password now rides on the user insert and commits in the same transaction on both paths.
