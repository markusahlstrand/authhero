import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  QueryResult,
} from "kysely";
import { Database } from "../src/db";
import { MAX_BATCHES, createSessionCleanup } from "../src/cleanup";

const BATCH_SIZE = 1000;

/**
 * A connection that answers each DELETE with a scripted row count, so the
 * batch budget can be exercised without materialising millions of rows.
 */
class ScriptedConnection implements DatabaseConnection {
  readonly tables: string[] = [];

  constructor(private readonly deletedRows: (table: string) => number) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const match = /^delete from `([a-z_]+)`/.exec(compiledQuery.sql);
    if (!match?.[1]) {
      throw new Error(`Unexpected statement: ${compiledQuery.sql}`);
    }

    this.tables.push(match[1]);
    return { rows: [], numAffectedRows: BigInt(this.deletedRows(match[1])) };
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Not implemented");
  }
}

function stubDb(deletedRows: (table: string) => number) {
  const connection = new ScriptedConnection(deletedRows);

  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    releaseConnection: async () => {},
    destroy: async () => {},
  };

  const dialect: Dialect = {
    createAdapter: () => new MysqlAdapter(),
    createDriver: () => driver,
    createIntrospector: (db) => new MysqlIntrospector(db),
    createQueryCompiler: () => new MysqlQueryCompiler(),
  };

  return { connection, db: new Kysely<Database>({ dialect }) };
}

const countOf = (tables: string[], table: string) =>
  tables.filter((t) => t === table).length;

describe("session cleanup batch budget", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sweeps every table even when an earlier one has a large backlog", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // refresh_tokens never drains; the other two clear in a single batch.
    const { connection, db } = stubDb((table) =>
      table === "refresh_tokens" ? BATCH_SIZE : 5,
    );

    await createSessionCleanup(db)();

    expect(connection.tables.slice(0, 3)).toEqual([
      "refresh_tokens",
      "sessions",
      "login_sessions",
    ]);
    expect(countOf(connection.tables, "sessions")).toBe(1);
    expect(countOf(connection.tables, "login_sessions")).toBe(1);
    expect(countOf(connection.tables, "refresh_tokens")).toBeGreaterThan(1);
  });

  it("stops at the batch budget instead of looping until drained", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { connection, db } = stubDb(() => BATCH_SIZE);

    await createSessionCleanup(db)();

    expect(connection.tables).toHaveLength(MAX_BATCHES);
    // Round-robin: no table is starved by the ones swept before it.
    for (const table of ["refresh_tokens", "sessions", "login_sessions"]) {
      expect(countOf(connection.tables, table)).toBe(MAX_BATCHES / 3);
    }
  });

  it("warns rather than logging success when the budget runs out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const { db } = stubDb((table) =>
      table === "login_sessions" ? BATCH_SIZE : 0,
    );

    await createSessionCleanup(db)();

    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    // Names the table that ran out of budget, and only that one.
    expect(message).toContain(`before login_sessions drained`);
    expect(message).toContain(String(MAX_BATCHES));
  });

  it("logs the per-table totals when everything drains", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const { connection, db } = stubDb((table) =>
      table === "sessions" ? 3 : 0,
    );

    await createSessionCleanup(db)();

    expect(connection.tables).toHaveLength(3);
    expect(warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Session cleanup: deleted 0 refresh_tokens, 3 sessions, 0 login_sessions",
    );
  });
});
