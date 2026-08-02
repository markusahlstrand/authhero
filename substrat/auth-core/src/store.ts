// The tenant-store seam (#301): apply the bundled drizzle migrations against a
// platform-minted per-tenant relational store, idempotently — the K-31
// ready-gate half the old WFP path never had (its "ready but empty D1" class of
// incident is exactly what this closes).
//
// Runtime-agnostic on purpose: `TenantRelationalStore.query/exec` is the same
// shape on the pure adapter (better-sqlite3 file) and on Cloudflare (D1), so
// this file has no driver imports at all. The driver-specific `native` handle is
// narrowed by the harness that owns it (server.ts / worker.ts).
import type { TenantRelationalStore } from "@substrat-run/kernel";
import { MIGRATIONS } from "./migrations.generated.js";

const JOURNAL_TABLE = "_authhero_migrations";

/** Split one drizzle migration file into executable statements. */
function statementsOf(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Bring a tenant store to the bundled migration frontier. Idempotent: a
 * journal row per applied tag, so a retried provision (at-least-once platform
 * drain) converges instead of failing on existing tables.
 */
export function applyMigrations(store: TenantRelationalStore): {
  applied: string[];
} {
  store.exec(
    `CREATE TABLE IF NOT EXISTS ${JOURNAL_TABLE} (tag TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  const done = new Set(
    store
      .query<{ tag: string }>(`SELECT tag FROM ${JOURNAL_TABLE}`)
      .map((r) => r.tag),
  );
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (done.has(migration.tag)) continue;
    for (const stmt of statementsOf(migration.sql)) store.exec(stmt);
    store.exec(`INSERT INTO ${JOURNAL_TABLE} (tag, applied_at) VALUES (?, ?)`, [
      migration.tag,
      new Date().toISOString(),
    ]);
    applied.push(migration.tag);
  }
  return { applied };
}
