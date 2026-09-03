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

// One entry per statement the sweep is expected to emit, in round-robin order.
const SWEEPS = [
  "login_sessions.expires_at_ts",
  "refresh_tokens.expires_at_ts",
  "refresh_tokens.idle_expires_at_ts",
  "sessions.expires_at_ts",
  "sessions.idle_expires_at_ts",
];

/**
 * A connection that answers each DELETE with a scripted row count, so the
 * batch budget can be exercised without materialising millions of rows. The
 * script is keyed by `<table>.<column>`, since each table is swept by one
 * statement per expiry column.
 */
class ScriptedConnection implements DatabaseConnection {
  readonly statements: string[] = [];
  readonly sql: string[] = [];

  constructor(private readonly deletedRows: (sweep: string) => number) {}

  get tables(): string[] {
    return this.statements.map((statement) => statement.split(".")[0]!);
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const match = /^delete from `([a-z_]+)` where `([a-z_]+)` </.exec(
      compiledQuery.sql,
    );
    if (!match?.[1] || !match[2]) {
      throw new Error(`Unexpected statement: ${compiledQuery.sql}`);
    }

    const sweep = `${match[1]}.${match[2]}`;
    this.statements.push(sweep);
    this.sql.push(compiledQuery.sql);
    // The script may throw to simulate a statement timeout.
    return { rows: [], numAffectedRows: BigInt(this.deletedRows(sweep)) };
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Not implemented");
  }
}

function stubDb(deletedRows: (sweep: string) => number) {
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

const countOf = (entries: string[], entry: string) =>
  entries.filter((candidate) => candidate === entry).length;

describe("session cleanup batch budget", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sweeps every table even when an earlier one has a large backlog", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // refresh_tokens never drains; the other tables clear in a single batch.
    const { connection, db } = stubDb((sweep) =>
      sweep.startsWith("refresh_tokens") ? BATCH_SIZE : 5,
    );

    await createSessionCleanup(db)();

    expect(connection.statements.slice(0, SWEEPS.length)).toEqual(SWEEPS);
    expect(countOf(connection.tables, "sessions")).toBe(2);
    expect(countOf(connection.tables, "login_sessions")).toBe(1);
    expect(countOf(connection.tables, "refresh_tokens")).toBeGreaterThan(2);
  });

  it("stops at the batch budget instead of looping until drained", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { connection, db } = stubDb(() => BATCH_SIZE);

    await createSessionCleanup(db)();

    expect(connection.statements).toHaveLength(MAX_BATCHES);
    // Round-robin: no sweep is starved by the ones that run before it.
    for (const sweep of SWEEPS) {
      expect(countOf(connection.statements, sweep)).toBe(
        MAX_BATCHES / SWEEPS.length,
      );
    }
  });

  it("never ORs the two expiry columns into one statement", async () => {
    const { connection, db } = stubDb(() => 0);

    await createSessionCleanup(db)({
      tenant_id: "tenantId",
      user_id: "email|user1",
    });

    // MySQL declines to index_merge across an OR and falls back to a full
    // scan, which on a production-sized table exceeds the statement timeout.
    // Every sweep must therefore be a single-column range on its own index.
    expect(connection.statements).toEqual(SWEEPS);
    for (const sql of connection.sql) {
      expect(sql).not.toContain(" or ");
    }
  });

  it("keeps sweeping the other tables when one statement throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { connection, db } = stubDb((sweep) => {
      if (sweep === "login_sessions.expires_at_ts") {
        throw new Error("statement timeout");
      }
      return 7;
    });

    await createSessionCleanup(db)();

    // The failing sweep is attempted once and then skipped; every other sweep
    // still runs, rather than the whole run aborting on the first throw.
    expect(countOf(connection.statements, "login_sessions.expires_at_ts")).toBe(
      1,
    );
    for (const sweep of SWEEPS.slice(1)) {
      expect(countOf(connection.statements, sweep)).toBe(1);
    }

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain(
      "login_sessions.expires_at_ts",
    );
    // A run that lost a table is not a clean run.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "login_sessions.expires_at_ts failed",
    );
  });

  it("warns rather than logging success when the budget runs out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const { db } = stubDb((sweep) =>
      sweep === "login_sessions.expires_at_ts" ? BATCH_SIZE : 0,
    );

    await createSessionCleanup(db)();

    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    // Names the sweep that ran out of budget, and only that one.
    expect(message).toContain(`before login_sessions.expires_at_ts drained`);
    expect(message).toContain(String(MAX_BATCHES));
  });

  it("logs the per-table totals when everything drains", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const { connection, db } = stubDb((sweep) =>
      sweep === "sessions.idle_expires_at_ts" ? 3 : 0,
    );

    await createSessionCleanup(db)();

    expect(connection.statements).toHaveLength(SWEEPS.length);
    expect(warn).not.toHaveBeenCalled();
    // Totals are per table, not per statement: the two sessions sweeps are
    // summed into one entry.
    expect(log).toHaveBeenCalledWith(
      "Session cleanup: deleted 0 login_sessions, 0 refresh_tokens, 3 sessions",
    );
  });
});
