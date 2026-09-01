import { describe, it, expect } from "vitest";
import { getTestServer } from "./helpers/test-server";
import type { TenantOperationRowInsert } from "@authhero/adapter-interfaces";

type Adapters = Awaited<ReturnType<typeof getTestServer>>["data"];

async function createImportOperation(data: Adapters): Promise<string> {
  const operation = await data.tenantOperations!.create({
    tenant_id: "tenant-a",
    kind: "users_import",
    engine: "inline",
  });
  return operation.id;
}

function stagedRows(
  operation_id: string,
  count: number,
): TenantOperationRowInsert[] {
  return Array.from({ length: count }, (_, seq) => ({
    operation_id,
    seq,
    payload: { email: `user${seq}@example.com` },
  }));
}

describe("TenantOperationRowsAdapter", () => {
  it("stages more rows than fit in one insert statement", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperationRows!;
    expect(adapter).toBeDefined();

    const operation_id = await createImportOperation(data);

    // 137 > the 50-row insert chunk, so this exercises the chunking loop.
    const written = await adapter.createMany(stagedRows(operation_id, 137));
    expect(written).toBe(137);

    const counts = await adapter.countByStatus(operation_id);
    expect(counts.total).toBe(137);
    expect(counts.pending).toBe(137);

    const page = await adapter.list(operation_id, { page: 1, per_page: 100 });
    expect(page.length).toBe(37);
    expect(page.start).toBe(100);
    expect(page.rows[0].seq).toBe(100);
    expect(page.rows[0].payload).toEqual({ email: "user100@example.com" });
  });

  it("stages nothing for an empty batch", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperationRows!;
    const operation_id = await createImportOperation(data);

    expect(await adapter.createMany([])).toBe(0);
    expect((await adapter.countByStatus(operation_id)).total).toBe(0);
  });

  it("hands out pending rows in seq order and stops handing out committed ones", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperationRows!;
    const operation_id = await createImportOperation(data);

    await adapter.createMany(stagedRows(operation_id, 5));

    const first = await adapter.claimPending(operation_id, 2);
    expect(first.map((row) => row.seq)).toEqual([0, 1]);

    await adapter.recordOutcomes(operation_id, [
      { seq: 0, status: "inserted", entity_id: "auth2|0" },
      { seq: 1, status: "inserted", entity_id: "auth2|1" },
    ]);

    const second = await adapter.claimPending(operation_id, 2);
    expect(second.map((row) => row.seq)).toEqual([2, 3]);
  });

  it("does not let a replayed chunk overwrite a terminal status", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperationRows!;
    const operation_id = await createImportOperation(data);

    await adapter.createMany(stagedRows(operation_id, 3));

    const applied = await adapter.recordOutcomes(operation_id, [
      { seq: 0, status: "inserted", entity_id: "auth2|first" },
      {
        seq: 1,
        status: "failed",
        error_code: "UNSUPPORTED_HASH_ALGORITHM",
        error_message: "bcrypt only",
        error_path: "custom_password_hash.algorithm",
      },
    ]);
    expect(applied).toBe(2);

    // The same chunk arrives a second time after a driver restart.
    const replayed = await adapter.recordOutcomes(operation_id, [
      { seq: 0, status: "failed", error_code: "SHOULD_NOT_APPLY" },
      { seq: 1, status: "inserted", entity_id: "auth2|should-not-apply" },
    ]);
    expect(replayed).toBe(0);

    const rows = await adapter.list(operation_id);
    expect(rows.rows[0].status).toBe("inserted");
    expect(rows.rows[0].entity_id).toBe("auth2|first");
    expect(rows.rows[0].error_code).toBeNull();
    expect(rows.rows[1].status).toBe("failed");
    expect(rows.rows[1].error_code).toBe("UNSUPPORTED_HASH_ALGORITHM");
    expect(rows.rows[1].error_path).toBe("custom_password_hash.algorithm");
    expect(rows.rows[1].entity_id).toBeNull();
    expect(rows.rows[2].status).toBe("pending");
  });

  it("counts every status in one rollup", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperationRows!;
    const operation_id = await createImportOperation(data);

    await adapter.createMany(stagedRows(operation_id, 6));
    await adapter.recordOutcomes(operation_id, [
      { seq: 0, status: "inserted" },
      { seq: 1, status: "inserted" },
      { seq: 2, status: "updated" },
      { seq: 3, status: "failed", error_code: "BAD_EMAIL" },
      { seq: 4, status: "skipped" },
    ]);

    expect(await adapter.countByStatus(operation_id)).toEqual({
      total: 6,
      pending: 1,
      inserted: 2,
      updated: 1,
      failed: 1,
      skipped: 1,
    });
  });

  it("filters the list by one status or a set, and scopes to the operation", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperationRows!;
    const operation_id = await createImportOperation(data);
    const other_operation_id = await createImportOperation(data);

    await adapter.createMany(stagedRows(operation_id, 4));
    await adapter.createMany(stagedRows(other_operation_id, 2));
    await adapter.recordOutcomes(operation_id, [
      { seq: 0, status: "failed", error_code: "BAD_EMAIL" },
      { seq: 1, status: "inserted" },
      { seq: 2, status: "skipped" },
    ]);

    const failed = await adapter.list(operation_id, { status: "failed" });
    expect(failed.rows.map((row) => row.seq)).toEqual([0]);

    const terminal = await adapter.list(operation_id, {
      status: ["inserted", "skipped"],
    });
    expect(terminal.rows.map((row) => row.seq)).toEqual([1, 2]);

    const other = await adapter.list(other_operation_id);
    expect(other.length).toBe(2);
  });

  it("removes only the rows of the given operation", async () => {
    const { data } = await getTestServer();
    const adapter = data.tenantOperationRows!;
    const operation_id = await createImportOperation(data);
    const other_operation_id = await createImportOperation(data);

    await adapter.createMany(stagedRows(operation_id, 3));
    await adapter.createMany(stagedRows(other_operation_id, 2));

    expect(await adapter.removeByOperation(operation_id)).toBe(3);
    expect((await adapter.countByStatus(operation_id)).total).toBe(0);
    expect((await adapter.countByStatus(other_operation_id)).total).toBe(2);
  });
});
