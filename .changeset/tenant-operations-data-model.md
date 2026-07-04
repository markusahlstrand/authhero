---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
---

Add control-plane data model for durable tenant lifecycle operations (issue #1026): new `tenant_operations`, `tenant_operation_events` (append-only), and `rollouts` entities with optional `tenantOperations`, `tenantOperationEvents`, and `rollouts` adapters in `DataAdapters`. The tenant row's provisioning fields remain the current-state snapshot; these tables are the history explaining how it got there.

These are control-plane-only tables. In the drizzle adapter they live in a separate `drizzle-control-plane/` migration set (own journal; apply with `migrationsTable: "__drizzle_migrations_control_plane"`) so WFP tenant D1s — which apply everything in `drizzle/` — never get them, and `createAdapters(db, { controlPlane: true })` opts a control-plane deployment into the new adapters. The kysely adapter (control-plane databases only) carries them in its normal migration chain.
