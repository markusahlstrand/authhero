import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { DrizzleDb } from "./types";

export type SqliteBatchItem = BatchItem<"sqlite">;

/** A non-empty list of write statements to apply as a single atomic unit. */
type AtomicStatements = readonly [SqliteBatchItem, ...SqliteBatchItem[]];

/** Mutable variant call sites build up before passing to {@link runAtomic}. */
export type AtomicStatementList = [SqliteBatchItem, ...SqliteBatchItem[]];

/**
 * The async (D1) driver exposes `batch()`, which executes its statements as a
 * single atomic unit. The sync better-sqlite3 driver used in tests does not, so
 * `DrizzleDb` (shared across both) can't declare it. We feature-detect instead.
 */
interface BatchCapableDb {
  batch(statements: AtomicStatements): Promise<unknown[]>;
}

function hasBatch(db: DrizzleDb): db is DrizzleDb & BatchCapableDb {
  const candidate: unknown = db;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "batch" in candidate &&
    typeof candidate.batch === "function"
  );
}

/**
 * Apply a set of dependent write statements atomically across drivers.
 *
 * On D1 (async) this uses `db.batch()`, which D1 runs as one atomic unit, so a
 * failure of any statement (or the commit) leaves nothing persisted. On
 * better-sqlite3 (sync, tests) it falls back to manual `BEGIN/COMMIT/ROLLBACK`,
 * because that driver has no `batch()` and Drizzle's `db.transaction()` can't
 * await an async callback there. Interactive `BEGIN/COMMIT` is *not* atomic on
 * D1, which is why the batch path exists.
 *
 * Returns the per-statement results in order (the batch response on D1; each
 * awaited builder's result on better-sqlite3).
 */
export async function runAtomic(
  db: DrizzleDb,
  statements: AtomicStatements,
): Promise<unknown[]> {
  if (hasBatch(db)) {
    return db.batch(statements);
  }

  await db.run(sql`BEGIN`);
  try {
    const results: unknown[] = [];
    for (const statement of statements) {
      results.push(await statement);
    }
    await db.run(sql`COMMIT`);
    return results;
  } catch (error) {
    await db.run(sql`ROLLBACK`);
    throw error;
  }
}
