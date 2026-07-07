import { describe, it, expect, vi } from "vitest";
import { createActionVersionsAdapter } from "../../src/adapters/actionVersions";
import type { DrizzleDb } from "../../src/adapters/types";

// Chainable mock of the drizzle query builder: create() first reads the
// latest version number, then hands its write statements to db.batch()
// (the D1 atomic path in runAtomic). The statement sentinels let the
// assertions verify exactly which builders were batched together.
function makeBatchDb(latest?: { number: number }) {
  const insertStatement = { statement: "insert" };
  const updateStatement = { statement: "update" };
  const batch = vi.fn(async (statements: unknown[]) =>
    statements.map(() => []),
  );
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({ get: async () => latest }),
          }),
        }),
      }),
    }),
    insert: () => ({ values: () => insertStatement }),
    update: () => ({ set: () => ({ where: () => updateStatement }) }),
    batch,
  };
  return {
    db: db as unknown as DrizzleDb,
    batch,
    insertStatement,
    updateStatement,
  };
}

describe("actionVersions.create on a batch-capable driver (D1)", () => {
  it("applies the deployed-clear and insert as a single db.batch() call", async () => {
    const { db, batch, insertStatement, updateStatement } = makeBatchDb({
      number: 2,
    });
    const adapter = createActionVersionsAdapter(db);

    const version = await adapter.create("tenant1", {
      action_id: "act_1",
      code: "exports.onExecutePostLogin = async () => {};",
      deployed: true,
    });

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith([updateStatement, insertStatement]);
    expect(version.number).toBe(3);
    expect(version.deployed).toBe(true);
  });

  it("batches only the insert when the new version is not deployed", async () => {
    const { db, batch, insertStatement } = makeBatchDb();
    const adapter = createActionVersionsAdapter(db);

    const version = await adapter.create("tenant1", {
      action_id: "act_1",
      code: "exports.onExecutePostLogin = async () => {};",
      deployed: false,
    });

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith([insertStatement]);
    expect(version.number).toBe(1);
    expect(version.deployed).toBe(false);
  });
});
