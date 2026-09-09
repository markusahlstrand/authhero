---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"authhero": minor
---

Batch the bulk user import's row writes, so a large migration is bounded by database throughput rather than round-trip latency.

`advanceUsersImport` processed staged rows strictly one at a time: up to four existence probes, then a user insert, then a password insert, each awaited in turn. Measured against a hosted PlanetScale database that is roughly 400 ms per row — almost entirely waiting — which puts a million-user import somewhere around 55 hours, and gets worse the further the database is from the worker.

A chunk is now parsed and mapped in memory, every existence probe for a given field runs as a single query, and the rows that turn out to be new users are written with one batched insert. A 50-row chunk goes from about 200 queries to about five; a 20-user import now issues zero per-row `users.create` calls.

Probes are deliberately one query per field rather than one query overall. MySQL will not `index_merge` across an `OR` spanning two columns and falls back to a full scan, but an `OR` over a single column resolves as a range scan on that column's index — so `email:"a" OR email:"b"` is fast while mixing fields would not be.

Adds an optional `createMany` to `UserDataAdapter`, implemented by the kysely adapter. It is optional and callers fall back to looping `create`, so adapters that do not implement it keep working unchanged. It writes the users row and its companion password row only — identities, activity counters and outbox events still go through `create`, and a user carrying them is rejected rather than silently written without them.

Three properties the sequential loop provided for free are now explicit, and covered by tests:

- **In-chunk de-duplication.** Two rows sharing an email used to be impossible to double-insert because the second row's probe saw the first row's write. A batch probes everything before writing anything, so the chunk is de-duplicated in memory.
- **Per-row error attribution.** Validation and conflict outcomes are decided before any write, so they stay attributed to their own row. If a batch insert fails, the whole chunk is retried row by row so each failure is recorded against the row that caused it.
- **Resume after an interrupted driver.** Rows whose derived id already exists are still recognised as their own earlier write rather than reported as a spurious conflict.

Upserts continue to use the per-row path: updating existing users writes different values per row, which does not batch, and a bulk migration is overwhelmingly `upsert: false`.
