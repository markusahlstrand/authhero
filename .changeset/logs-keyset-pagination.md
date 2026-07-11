---
"authhero": minor
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
---

`GET /logs` now supports true keyset (checkpoint) pagination with an opaque `next` cursor.

Auth0 documents `/logs` as a checkpoint endpoint, but our implementation only supported `page`/`per_page` offsets. The kysely and drizzle adapters now branch to the shared keyset paginator (date desc by default, log_id tiebreaker) when `from`/`take` is present, and the endpoint returns `{ logs, next }` in that mode. As a superset of Auth0 — which ignores `q`/`sort` under `from`/`take` on `/logs` — `q` and `from_date`/`to_date` filters stay in effect during a cursor walk, and sorting by `date` (asc/desc) is honored; other sort columns are rejected with a 400 rather than silently ignored.

To make sort-aware cursors safe, the cursor payload gains an optional sort-key field (`k`): a token minted under one sort that is replayed under a different sort is rejected with a 400 instead of returning pages from the wrong position.

The management API error handler now duck-types HTTPException-like errors (numeric `status` + `getResponse`) instead of `instanceof HTTPException`, so 4xx errors thrown inside the bundled kysely/drizzle adapters map to proper HTTP responses rather than escaping as 500s.
