import {
  CompiledQuery,
  ConnectionProvider,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
} from "kysely";
import { Migrator } from "kysely/migration";

import ReferenceMigrationProvider from "./ReferenceMigrationProvider";
import migrations from "./migrations";
import { setMigrationDebug } from "./log";
import { Database } from "../src/db";

/**
 * Upper bound on captured writes per migration. A data migration that pages
 * with "select rows still needing the fix, update them, repeat" never makes
 * progress in a dry run — the updates are not applied, so every page returns
 * the same rows — and would loop forever without this.
 */
const MAX_STATEMENTS_PER_MIGRATION = 5000;

export interface PlannedStatement {
  sql: string;
  parameters: readonly unknown[];
}

export interface PlannedMigration {
  name: string;
  /** Writes (DDL and DML) the migration would execute, in order. */
  statements: PlannedStatement[];
  /**
   * Set when the migration threw during planning. The statements captured
   * before the failure are still listed. This can be a dry-run artifact: a
   * migration that reads a column an earlier pending migration adds will fail
   * here because the earlier migration was never applied.
   */
  error?: string;
  /** True when planning stopped at MAX_STATEMENTS_PER_MIGRATION. */
  truncated?: boolean;
}

export interface MigrationPlan {
  /** Migrations already recorded as executed, in order. */
  executed: string[];
  /** Migrations `migrateToLatest` would run, in order. */
  pending: PlannedMigration[];
}

class StatementLimitError extends Error {}

function isReadOnly(query: CompiledQuery): boolean {
  if (query.query.kind === "SelectQueryNode") return true;
  if (query.query.kind !== "RawNode") return false;
  const text = query.sql.trimStart();
  if (/^(select|show|explain|describe|desc)\b/i.test(text)) return true;
  // `PRAGMA foo` reads, `PRAGMA foo = bar` writes.
  return /^pragma\b/i.test(text) && !text.includes("=");
}

class CapturingConnection implements DatabaseConnection {
  constructor(
    private readonly inner: DatabaseConnection,
    private readonly captured: PlannedStatement[],
  ) {}

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    // Reads go to the real database so dialect detection, row counts and
    // backfill page queries behave as they would in the real run.
    if (isReadOnly(query)) return this.inner.executeQuery<R>(query);

    if (this.captured.length >= MAX_STATEMENTS_PER_MIGRATION) {
      throw new StatementLimitError(
        `stopped after ${MAX_STATEMENTS_PER_MIGRATION} statements`,
      );
    }
    this.captured.push({ sql: query.sql, parameters: query.parameters });
    return { rows: [], numAffectedRows: BigInt(0) };
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("streaming queries are not supported in a dry run");
  }
}

function unsupported(): never {
  throw new Error("not available in a migration dry run");
}

const unsupportedDriver: Driver = {
  init: async () => {},
  acquireConnection: unsupported,
  beginTransaction: unsupported,
  commitTransaction: unsupported,
  rollbackTransaction: unsupported,
  releaseConnection: unsupported,
  destroy: async () => {},
};

/**
 * A Kysely instance that compiles with `db`'s dialect and reads from `db`'s
 * database, but records every write in `captured` instead of executing it.
 */
function createCapturingDb(
  db: Kysely<Database>,
  captured: PlannedStatement[],
): Kysely<Database> {
  const realExecutor = db.getExecutor();
  const connectionProvider: ConnectionProvider = {
    provideConnection: (consumer) =>
      realExecutor.provideConnection((connection) =>
        consumer(new CapturingConnection(connection, captured)),
      ),
  };
  const executor = realExecutor.withConnectionProvider(connectionProvider);
  const dialect: Dialect = {
    createAdapter: () => realExecutor.adapter,
    createDriver: () => unsupportedDriver,
    createQueryCompiler: (): QueryCompiler => unsupported(),
    createIntrospector: (): DatabaseIntrospector => unsupported(),
  };

  return new Kysely<Database>({
    config: { dialect },
    dialect,
    driver: unsupportedDriver,
    executor,
  });
}

/**
 * Dry run of `migrateToLatest`: lists the pending migrations and the SQL each
 * would execute, without changing the database.
 *
 * Each pending migration's `up` runs against a wrapper around `db` that
 * passes reads through and captures writes. Nothing is written — including
 * the `kysely_migration` bookkeeping tables, which are only read if present.
 *
 * Because captured writes are never applied, the plan can diverge from a real
 * run where a migration depends on its own or an earlier migration's writes:
 * "tolerate duplicate column" guards never fire (so an already-present column
 * still shows up as an ALTER), and reads of not-yet-created columns fail (see
 * `PlannedMigration.error`).
 */
export async function planMigrations(
  db: Kysely<Database>,
): Promise<MigrationPlan> {
  setMigrationDebug(false);

  const migrator = new Migrator({
    db,
    provider: new ReferenceMigrationProvider(migrations),
  });
  const infos = await migrator.getMigrations();

  const executed = infos.filter((it) => it.executedAt).map((it) => it.name);
  const pendingInfos = infos.filter((it) => !it.executedAt);

  const lastExecuted = executed[executed.length - 1];
  const outOfOrder = lastExecuted
    ? pendingInfos.find((it) => it.name < lastExecuted)
    : undefined;
  if (outOfOrder) {
    // Mirrors the check that makes migrateToLatest refuse to run.
    throw new Error(
      `pending migration "${outOfOrder.name}" sorts before already-executed "${lastExecuted}"; migrateToLatest would refuse to run`,
    );
  }

  const pending: PlannedMigration[] = [];
  for (const info of pendingInfos) {
    const statements: PlannedStatement[] = [];
    const planned: PlannedMigration = { name: info.name, statements };
    try {
      await info.migration.up(createCapturingDb(db, statements));
    } catch (error: unknown) {
      planned.error = error instanceof Error ? error.message : String(error);
      if (error instanceof StatementLimitError) planned.truncated = true;
    }
    pending.push(planned);
  }

  return { executed, pending };
}

/** Renders a plan as an SQL-ish script for printing. */
export function formatMigrationPlan(plan: MigrationPlan): string {
  if (plan.pending.length === 0) {
    return `-- Database is up to date (${plan.executed.length} migrations executed).`;
  }

  const lines = [
    `-- ${plan.pending.length} pending migration(s); ${plan.executed.length} already executed.`,
  ];
  for (const migration of plan.pending) {
    lines.push("", `-- Migration: ${migration.name}`);
    if (migration.statements.length === 0 && !migration.error) {
      lines.push("-- (no writes)");
    }
    for (const statement of migration.statements) {
      lines.push(`${statement.sql};`);
      if (statement.parameters.length > 0) {
        const parameters = JSON.stringify(statement.parameters, (_, value) =>
          typeof value === "bigint" ? value.toString() : value,
        );
        lines.push(`-- parameters: ${parameters}`);
      }
    }
    if (migration.error) {
      lines.push(
        `-- ${migration.truncated ? "TRUNCATED" : "ERROR during dry run"}: ${migration.error}`,
      );
    }
  }
  return lines.join("\n");
}
