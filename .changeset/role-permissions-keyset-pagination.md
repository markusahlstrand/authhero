---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
"authhero": minor
---

Add checkpoint pagination (`from`/`take` with an opaque `next` cursor) to `GET /api/v2/roles/{id}/permissions`, backed by a new optional `rolePermissions.listCheckpoint` adapter method. `page`/`per_page`/`include_totals` responses are unchanged. The DynamoDB connections list now returns its `next` cursor, so checkpoint walks over connections no longer stop after the first page.
