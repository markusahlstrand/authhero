import type { SqlMigration } from "@substrat-run/kernel";

// The console's tenant record. One row per customer tenant, holding ONLY the
// facts the console owns (provisioning-capability.md §9.1): the proposed ids
// (the join key `id` IS the AuthHero/WFP tenant id), display metadata, and the
// plan choice. Existence/status/entitlements are the PLATFORM's facts — status is
// derived from the intent spine today and from the §9 managed-tenants projection
// once it ships; it is deliberately NOT a column here (a stored copy would be the
// second-writer smell §9 removes).
//
// Tables are prefixed with the module id, ids are TEXT (ULID), timestamps are
// ISO-8601 TEXT. Append-only forever once shipped — this is the migration the
// checkpoint reviews. (Edited pre-ship: the earlier draft carried a `status`
// column; dropped for §9. Flagged at the checkpoint.)
export const controlplaneMigrations: SqlMigration[] = [
  {
    version: "0001-init",
    sql: `
      CREATE TABLE controlplane_tenant (
        id            TEXT PRIMARY KEY,
        slug          TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        plan          TEXT NOT NULL,
        auth_scope_id TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );
    `,
  },
];

// The auth-core stand-in reads entitlements through the kernel; it owns no tables
// of its own in this skeleton. (The real auth core keeps its schema in its own
// per-tenant D1, entirely outside Substrat.)
export const authcoreMigrations: SqlMigration[] = [];
