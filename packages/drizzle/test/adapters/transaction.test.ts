import { describe, it, expect, vi } from "vitest";
import { sql } from "drizzle-orm";
import createAdapters from "../../src/adapters";
import type { DrizzleDb } from "../../src/adapters/types";

describe("createAdapters transaction()", () => {
  describe("batch-capable driver (D1)", () => {
    function makeBatchDb() {
      const run = vi.fn(async () => {});
      const batch = vi.fn(async () => []);
      return { run, batch, db: { run, batch } as unknown as DrizzleDb };
    }

    it("runs the callback without BEGIN/COMMIT/ROLLBACK and returns its result", async () => {
      const { run, batch, db } = makeBatchDb();
      const data = createAdapters(db);

      const callback = vi.fn(async () => "result");
      const result = await data.transaction(callback);

      expect(result).toBe("result");
      expect(callback).toHaveBeenCalledTimes(1);
      // No interactive transaction statements — D1 rejects raw BEGIN.
      expect(run).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
    });

    it("propagates a throwing callback without issuing ROLLBACK", async () => {
      const { run, db } = makeBatchDb();
      const data = createAdapters(db);

      await expect(
        data.transaction(async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe("sync driver (better-sqlite3)", () => {
    function makeSyncDb() {
      const run = vi.fn(async (_query: unknown) => {});
      return { run, db: { run } as unknown as DrizzleDb };
    }

    it("wraps the callback in BEGIN/COMMIT on success", async () => {
      const { run, db } = makeSyncDb();
      const data = createAdapters(db);

      const order: string[] = [];
      run.mockImplementation(async () => {
        order.push("run");
      });
      const result = await data.transaction(async () => {
        order.push("callback");
        return 42;
      });

      expect(result).toBe(42);
      expect(order).toEqual(["run", "callback", "run"]);
      expect(run.mock.calls.map(([query]) => query)).toEqual([
        sql`BEGIN`,
        sql`COMMIT`,
      ]);
    });

    it("issues ROLLBACK and rethrows when the callback fails", async () => {
      const { run, db } = makeSyncDb();
      const data = createAdapters(db);

      await expect(
        data.transaction(async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(run.mock.calls.map(([query]) => query)).toEqual([
        sql`BEGIN`,
        sql`ROLLBACK`,
      ]);
    });
  });

  describe("useTransactions: false", () => {
    it("skips transaction statements on a sync driver too", async () => {
      const run = vi.fn(async () => {});
      const db = { run } as unknown as DrizzleDb;
      const data = createAdapters(db, { useTransactions: false });

      const result = await data.transaction(async () => "plain");

      expect(result).toBe("plain");
      expect(run).not.toHaveBeenCalled();
    });
  });
});
