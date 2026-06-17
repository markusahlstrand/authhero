In an auth system, data integrity is everything. When a user changes their password or deletes their account, those facts have to be recorded, completely and reliably, or the whole notion of an audit log falls apart. This post is about a deceptively hard problem hiding behind that requirement, and the pattern we use in AuthHero to solve it: **the transactional outbox**.

## The dual-write challenge

Picture a common flow: a user deletes their account.

Your handler does two things. First it updates your SQL database (PlanetScale, Cloudflare D1, or whatever you run). Then it ships an audit event off to your analytics store, like ClickHouse or Cloudflare's Analytics Engine, so the deletion is recorded for compliance and debugging.

Now the network blinks. The database write succeeds, but the call to ClickHouse times out, or the service answers with a 500.

You're left with a **silent security event**. The system changed, but the log says nothing happened. In the worst case you have an inconsistency: the user believes their account is gone, while the rest of your system, everything downstream that reacts to events, has no idea.

> Without atomicity between your primary database and your event stream, "at-least-once delivery" is a lie.

This is the classic **dual-write problem**. Any time you write to two systems in sequence without a shared transaction, a crash between the two writes leaves you inconsistent. You cannot fix it with a retry, because you don't reliably know *which* write succeeded.

## How AuthHero implements the outbox

The transactional outbox sidesteps the problem by refusing to do two writes in the first place. There is exactly one write that matters, the one to your SQL database, and the event rides along inside it.

1. **The local transaction.** Instead of calling ClickHouse directly, you write the event to an `outbox` table *in the same SQL transaction* as your business logic. Thanks to ACID guarantees, the outcome is now binary: either both the change and the event are committed, or neither is. There is no in-between state to leak.

2. **The relay.** A background worker polls the `outbox` table, delivers the rows to ClickHouse (or Cloudflare Analytics Engine), and marks them as sent, or deletes them. AuthHero ships this as a relay you run on a schedule, with pluggable destinations.

3. **Idempotency.** The relay can crash *after* it has delivered an event but *before* it marks the row as done. So delivery is at-least-once, and the destination must tolerate seeing the same event twice. We give every outbox row a UUID and carry it through to the destination as an idempotency key.

Here's the shape of it, as illustrative pseudocode rather than the exact API:

```ts
await db.transaction(async (tx) => {
  await tx.users.update(userId, { status: "DELETED" });

  await tx.outbox.create({
    id: crypto.randomUUID(), // doubles as the idempotency key
    type: "USER_DELETED",
    payload: { userId, timestamp: new Date().toISOString() },
    destination: "CLICKHOUSE",
  });
});
```

The change and the audit event commit together, or not at all. The network is no longer in the critical path of correctness.

## Why not change data capture?

The textbook alternative to an outbox is **change data capture (CDC)**: subscribe to the database's replication log and stream changes out. Firebase and Supabase lean on database triggers or CDC for exactly this kind of fan-out.

For the modern serverless and edge stack, though, CDC is usually either technically impossible or architecturally absurd. This is the part worth dwelling on. The outbox isn't just *an* option on this stack. It's often the *only* path to 100% reliability.

**Cloudflare D1** is SQLite at the edge. There is no replication log (WAL) you can subscribe to from outside, and you can't point a Debezium connector at a D1 database. But D1 *does* support atomic transactions via its batch API, which makes an outbox table the only way to guarantee an event is logged at the same instant the data changes. Without it, you're back to fire-and-forget.

**PlanetScale** is built on Vitess. It has offered streaming based on VReplication, but wiring it up is a heavy lift that typically pulls in external ETL tooling like Airbyte or Fivetran. Standing up a full CDC pipeline just to move audit logs to ClickHouse is like building a motorway to push a wheelbarrow down.

And there's a portability argument. If AuthHero is going to run across wildly different environments, it can't require that every operator has a working CDC setup. An outbox needs one thing: a plain SQL table.

## Atomicity on the edge with `db.batch()`

D1 doesn't expose traditional `BEGIN`/`COMMIT` blocks the way Postgres or MySQL do. Instead it gives you a **batch API** that executes a list of statements atomically. All of them land, or none do.

```ts
await db.batch([
  db.prepare("UPDATE users SET plan = ? WHERE id = ?").bind("pro", userId),
  db.prepare("INSERT INTO outbox (id, topic, payload) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), "user.upgraded", JSON.stringify(auditEvent)),
]);
```

That's the whole trick: you use the database's built-in guarantees to solve what is really a network problem.

AuthHero's adapters are built on **Kysely** (the default) and **Drizzle**. On D1, the primitive that matters is the batch API, and Drizzle's first-class `db.batch()` support maps onto it cleanly while keeping full type-safety across every result in the batch. Because Drizzle just generates SQL with no heavy runtime, it stays light enough to run comfortably inside a Cloudflare Worker, where every millisecond and every kilobyte of bundle size counts. Running both PlanetScale (MySQL) and D1 (SQLite) behind the same schema definitions means the outbox pattern looks the same in both environments, even though the dialects differ.

## Batching for performance and cost

There's a happy side effect to routing everything through the outbox: the relay controls how events reach your analytics store.

Writing to ClickHouse or Cloudflare Analytics Engine one row at a time gets slow and expensive fast. Because every event first lands in the outbox, the relay can pull a hundred of them and ship them in a single HTTP call. That saves CPU time (money) and network overhead, and it smooths out spikes, all without your request handlers knowing or caring.

## The trade-offs

No architecture is free. The honest costs of an outbox:

- **Write amplification.** Every logical event is now an extra `INSERT` in your SQL database. Under extreme write pressure, that can become a bottleneck.
- **Latency.** Events don't appear in ClickHouse the millisecond they happen. There's a natural delay set by how often your relay runs.
- **Infrastructure.** You need a worker draining the outbox. It's one more moving part to operate and monitor.

For an audit pipeline, these are easy trade-offs to make. A few milliseconds of write amplification and a little delivery lag, in exchange for never losing a security event.

## What you actually get

- **Compliance.** You can tell an auditor, truthfully, that *every* password change is logged. Not "almost always". Every one.
- **Debuggability and zero data loss.** If ClickHouse is down for two hours, events simply accumulate in your SQL database and flush when it comes back. Nothing is dropped.

Plenty of auth libraries advertise that they're "edge-ready" without mentioning what happens to your audit log when their call to Segment or Datadog times out. NextAuth/Auth.js and similar libraries tend to leave audit logging to you, and a quick `await` in an API route is a fire-and-forget that's wide open to mid-execution crashes. The big SaaS platforms (Auth0, Okta) almost certainly do something like this internally. They just hide it behind their APIs.

We'd rather be transparent about it, because the developers who care about SOC 2 and GDPR are exactly the ones who need their audit logs to be complete. In AuthHero, we don't trust the network. We trust the transaction.
