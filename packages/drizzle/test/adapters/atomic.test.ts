import { describe, it, expect, vi } from "vitest";
import { runAtomic } from "../../src/adapters/atomic";
import type { DrizzleDb } from "../../src/adapters/types";

// A statement stand-in: a thenable that records when it is awaited, so we can
// assert ordering relative to BEGIN/COMMIT on the fallback path. Casting to the
// BatchItem tuple keeps runAtomic's public signature intact for the test.
function fakeStatement(
  label: string,
  log: string[],
  options: { fail?: boolean } = {},
) {
  return {
    then(resolve: (value: string) => void, reject: (reason: unknown) => void) {
      log.push(label);
      if (options.fail) {
        reject(new Error(`boom:${label}`));
      } else {
        resolve(label);
      }
    },
  } as unknown as Parameters<typeof runAtomic>[1][number];
}

describe("runAtomic", () => {
  it("uses db.batch() when the driver exposes it (D1 path), without BEGIN/COMMIT", async () => {
    const run = vi.fn();
    const batch = vi.fn(async (stmts: unknown[]) =>
      stmts.map((_, i) => `result-${i}`),
    );
    const db = { run, batch } as unknown as DrizzleDb;

    const log: string[] = [];
    const statements = [
      fakeStatement("a", log),
      fakeStatement("b", log),
    ] as unknown as Parameters<typeof runAtomic>[1];

    const results = await runAtomic(db, statements);

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith(statements);
    // The batch driver runs the statements itself — runAtomic must not await
    // them (they'd execute twice) nor emit any interactive transaction.
    expect(log).toEqual([]);
    expect(run).not.toHaveBeenCalled();
    expect(results).toEqual(["result-0", "result-1"]);
  });

  it("falls back to BEGIN/COMMIT and awaits each statement when batch is absent", async () => {
    const log: string[] = [];
    const run = vi.fn(async () => {
      log.push("run");
    });
    const db = { run } as unknown as DrizzleDb;

    const statements = [
      fakeStatement("a", log),
      fakeStatement("b", log),
    ] as unknown as Parameters<typeof runAtomic>[1];

    const results = await runAtomic(db, statements);

    // BEGIN first, both statements, COMMIT last.
    expect(log).toEqual(["run", "a", "b", "run"]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(results).toEqual(["a", "b"]);
  });

  it("rolls back and rethrows when a statement fails on the fallback path", async () => {
    const log: string[] = [];
    const run = vi.fn(async () => {
      log.push("run");
    });
    const db = { run } as unknown as DrizzleDb;

    const statements = [
      fakeStatement("a", log),
      fakeStatement("b", log, { fail: true }),
    ] as unknown as Parameters<typeof runAtomic>[1];

    await expect(runAtomic(db, statements)).rejects.toThrow("boom:b");

    // BEGIN, a, b (fails) → ROLLBACK. No COMMIT.
    expect(log).toEqual(["run", "a", "b", "run"]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
