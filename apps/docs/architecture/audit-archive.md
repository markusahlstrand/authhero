---
title: Audit Archive (Design)
description: Design for streaming outbox audit events to R2 via Cloudflare Pipelines, providing a durable audit archive and config version history.
---

# Audit Archive via Cloudflare Pipelines (Design)

> **Status: proposed.** This page is a design document, not documentation of shipped behavior.

The `logs` table behind the management API `/logs` endpoint is a short-window store, mirroring Auth0's log retention model. This design adds a **durable, queryable archive** of all audit events by streaming the outbox to R2 as an Apache Iceberg table via [Cloudflare Pipelines](https://developers.cloudflare.com/pipelines/).

## Goals

1. **Long-term audit retention** — every management API mutation and auth event, retained for years, independent of the primary database.
2. **Config version history** — audit events carry `target.before`/`target.after`/`target.diff`, so the archive doubles as reconstructable history for entities that have no version tables (branding, prompts, connections, clients). Actions keep their dedicated `action_versions` table; nothing else gets one.
3. **Queryability** — "every change to branding for tenant X" is a SQL query (R2 SQL, DuckDB, Spark), not an object-listing crawl.

Auth0 offers neither config versioning (outside Actions) nor long log retention; its answer is log streams to external sinks plus GitOps via the Deploy CLI. This design keeps the same audit/versioning split but makes the archive first-class.

## Architecture

```text
management API mutation
  └─ outbox_events (full AuditEvent payload, transactional)
       └─ outbox relay
            ├─ logs destination        → logs table (short window, /logs API)
            ├─ log-streams destination → tenant HTTP sinks (Auth0 wire format)
            └─ pipeline destination    → Cloudflare Pipelines stream   ← NEW
                                           └─ SQL transform
                                                └─ r2-data-catalog sink
                                                     └─ Iceberg table in R2 (Parquet + zstd)
```

The new piece is a single `EventDestination` implementation alongside the existing ones in
`packages/authhero/src/helpers/outbox-destinations/`. Everything upstream already exists: the
outbox stores the **entire `AuditEvent`** as its payload, so `target.before/after/diff`,
`request.body`, actor, and response context all reach destinations without schema changes.

### Delivery transport

The destination sends events to the Pipelines **stream HTTP ingest endpoint** with a bearer
token, configured via env:

```ts
init({
  outbox: {
    enabled: true,
    pipeline: {
      endpoint: "https://<stream-id>.ingest.cloudflare.com",
      token: "<stream ingest token>",
    },
  },
});
```

Each POST carries a JSON array of records (the format the stream ingest endpoint accepts);
the relay delivers one event at a time, so that is normally a single-element array.

HTTP is chosen over the Worker binding so the destination works in every deployment
(Node/demo included) and stays symmetric with the log-streams destination. The stream buffers
and batches; the destination stays thin.

## Table schema

Promote the query and erasure keys to typed columns; keep the full event as a `json` column so
nothing is lost and the promoted set can grow later:

| Column        | Type      | Notes                                             |
| ------------- | --------- | ------------------------------------------------- |
| `id`          | string    | Event id — dedup key                              |
| `timestamp`   | timestamp | Partition by day                                  |
| `tenant_id`   | string    | Filter column (not a partition key)               |
| `event_type`  | string    | e.g. `branding.updated`                           |
| `log_type`    | string    | Auth0 code (`sapi`, `fapi`, `s`, ...)             |
| `category`    | string    | `admin_action` / `user_action` / `api` / `system` |
| `actor_id`    | string    | Erasure key                                       |
| `target_type` | string    |                                                   |
| `target_id`   | string    | Erasure key                                       |
| `event`       | json      | Full `AuditEvent`, verbatim                       |

Sink: `r2-data-catalog`, Parquet + zstd (defaults), automatic **compaction** enabled (the sink
rolls files every ~5 minutes; without compaction the table accumulates thousands of small
files), and **snapshot expiration** enabled so deleted data is physically removed.

Sinks are immutable after creation — settle the promoted-column set before pointing production
at it. The catch-all `event` column makes a wrong guess recoverable.

## Delivery semantics: duplicates are expected

The outbox relay retries **per event, not per destination**: if one destination fails, the
whole event is retried and already-successful destinations deliver again. The Iceberg sink is
append-only with no dedup, so the table will contain duplicates under normal operation.

- Consumers must dedup on `id` at query time, e.g.
  `QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp) = 1`.
- Optionally, per-destination delivery tracking (a schema change to `outbox_events`) would
  reduce — not eliminate — duplicates. Worth weighing before adding a second production
  destination, but not a blocker.

## GDPR and retention

Layered, with most of the burden handled before data reaches R2:

1. **Minimize at write.** Secret redaction already exists in `helpers/logging.ts`. Extend with
   a PII policy for the archive: keep pseudonymous ids (`user_id` — also the erasure key), but
   truncate or hash `request.ip` and drop `actor.email` from the archived copy. For `users.*`
   events, prefer archiving `diff` only rather than full before/after user profiles; config
   entities keep full state.
2. **Retention policy as the primary mechanism.** Audit logs are retained under legitimate
   interest / Art. 17(3) exemptions with a documented window (1–2 years). Snapshot expiration
   ages data out physically.
3. **Targeted erasure for forwarded deletion requests.** R2 SQL is read-only, but R2 Data
   Catalog is a standard Iceberg REST catalog: a periodic batch job (Spark or PyIceberg) runs
   `DELETE FROM audit_events WHERE actor_id = ? OR target_id = ?` over accumulated requests,
   and the next snapshot expiration removes the underlying files.

The database backup story is separate and complementary: short-retention snapshots
(PlanetScale automated backups, D1 Time Travel's 30-day window) for disaster recovery, so
erasure propagates through backups by aging out. The archive is the long-lived store; it is
the one that needs the deletion mechanism above.

## Version history semantics

With `before`/`after` populated, any past config state is reconstructable and "rollback" is a
PATCH with the `before` payload. Two honest caveats:

- History is only as complete as the API write path — migrations, backfills, and direct DB
  writes bypass `logMessage`. The archive is best-effort lineage, not a guaranteed restore
  point (that is what database backups are for).
- Today only 8 of ~30 management API modules pass `beforeState`/`afterState` (tenants,
  clients, connections, users, themes, organizations, resource-servers, client-grants).
  **Branding does not.** The rollout to the remaining modules is a prerequisite for the
  version-history goal and is mostly mechanical: read the entity before mutating, pass both
  states to `logMessage`.

## Open questions

1. **EU jurisdiction.** Docs state the R2 Data Catalog sink does not support writing to
   buckets in a different jurisdiction — EU-jurisdiction buckets are likely unsupported as
   catalog sinks. If tenants require EU residency for audit data, fall back to the plain R2
   Parquet sink (losing R2 SQL, compaction, and easy Iceberg deletes). **Confirm before
   building.**
2. **Beta maturity.** Pipelines and R2 SQL are beta; the outbox retains processed events only
   7 days, so pipeline-side loss is unrecoverable after that. Hedge: the destination interface
   is tiny — a boring NDJSON-to-R2 fallback destination is swappable later.
3. **Per-destination delivery tracking** (see duplicates above).
4. **PII policy for `users.*` events** — diff-only vs full snapshots is a product/legal call.

## Work items

1. Finish `beforeState`/`afterState` rollout to remaining management API modules (branding and
   prompts first).
2. Extend archive-bound redaction (IP truncation, drop `actor.email`, diff-only for `users.*`).
3. ~~`pipeline` outbox destination + env config + tests.~~ **Done** —
   `PipelineDestination` in `packages/authhero/src/helpers/outbox-destinations/pipeline.ts`,
   configured via `init({ outbox: { pipeline: { endpoint, token } } })` and registered on both
   the per-request and cron drain paths. Inert until the config is set.
4. Infra: stream, schema, sink (compaction + snapshot expiration), pipeline SQL — Terraform or
   wrangler, in the deploy repo.
5. Dedup guidance for consumers; decide on per-destination tracking.
6. Erasure batch job (PyIceberg) + runbook.
7. Restore/query smoke test: reconstruct a branding config from the archive in a scheduled
   check.

## Related

- [Audit Events](/architecture/audit-events) — the outbox pattern this builds on
- [Feature: Audit Logging](/features/audit-logging) — configuration and usage guide
- [Outbox Relay (Cron)](/deployment/outbox-cron) — scheduled relay wiring
