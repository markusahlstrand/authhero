import { describe, expect, it } from "vitest";
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
import type { DataAdapters } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { Database } from "../../src/db";
import { cleanupCodes } from "../../src/codes/cleanup";

const CHUNK = 50_000;

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function createTenant(data: DataAdapters) {
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
}

describe("codes cleanup (sqlite)", () => {
  it("deletes expired codes and keeps the rest", async () => {
    const { data } = await getTestServer();
    await createTenant(data);

    await data.codes.create("tenantId", {
      code_id: "expired",
      code_type: "otp",
      expires_at: iso(-1000 * 60 * 60),
    });
    await data.codes.create("tenantId", {
      code_id: "valid",
      code_type: "otp",
      expires_at: iso(1000 * 60 * 60),
    });

    expect(await data.codes.cleanup(iso(0))).toBe(1);
    expect(await data.codes.get("tenantId", "expired", "otp")).toBeNull();
    expect(await data.codes.get("tenantId", "valid", "otp")).not.toBeNull();
  });

  it("sweeps pre-migration rows that never got the numeric twin", async () => {
    const { data, db } = await getTestServer();
    await createTenant(data);

    // Written by an app version older than the migration that added
    // expires_at_ts, so only the ISO column is populated.
    await db
      .insertInto("codes")
      .values({
        tenant_id: "tenantId",
        code_id: "legacy",
        code_type: "otp",
        expires_at: iso(-1000 * 60 * 60),
        created_at: iso(-1000 * 60 * 60 * 2),
      })
      .execute();

    expect(await data.codes.cleanup(iso(0))).toBe(1);
    expect(await data.codes.get("tenantId", "legacy", "otp")).toBeNull();
  });
});

/**
 * A connection that answers every statement with a scripted deleted-row count,
 * so the MySQL chunking loop can be exercised without materialising 50k rows.
 */
class ScriptedConnection implements DatabaseConnection {
  readonly deletes: CompiledQuery[] = [];

  constructor(private readonly deletedRows: number[]) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    if (!compiledQuery.sql.startsWith("delete")) {
      // The `SELECT VERSION()` engine probe: succeeding means "mysql".
      return { rows: [] };
    }

    this.deletes.push(compiledQuery);
    const deleted = this.deletedRows.shift() ?? 0;
    return { rows: [], numAffectedRows: BigInt(deleted) };
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Not implemented");
  }
}

function mysqlStub(deletedRows: number[]) {
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

describe("codes cleanup (mysql)", () => {
  it("chunks each delete and keeps going until a pass comes up short", async () => {
    // Timestamp sweep: two full chunks then a short one. ISO fallback: one
    // short pass.
    const { connection, db } = mysqlStub([CHUNK, CHUNK, 17, 3]);

    const total = await cleanupCodes(db)(iso(0));

    expect(total).toBe(CHUNK * 2 + 17 + 3);
    expect(connection.deletes).toHaveLength(4);
    for (const query of connection.deletes) {
      // The chunk size may be compiled inline or as a parameter depending on
      // the dialect, so assert against both halves of the statement.
      const rendered = `${query.sql} ${query.parameters.join(" ")}`;
      expect(rendered).toContain("limit");
      expect(rendered).toContain(String(CHUNK));
    }
  });

  it("stops after one pass per statement when there is no backlog", async () => {
    const { connection, db } = mysqlStub([0, 0]);

    expect(await cleanupCodes(db)(iso(0))).toBe(0);
    expect(connection.deletes).toHaveLength(2);
  });
});
