import { describe, it, expect, beforeEach } from "vitest";
import type { TenantOperationRowInsert } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

function stageRows(
  operation_id: string,
  count: number,
): TenantOperationRowInsert[] {
  return Array.from({ length: count }, (_, seq) => ({
    operation_id,
    seq,
    payload: { email: `user-${seq}@example.com` },
  }));
}

describe("tenantOperationRows adapter", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(() => {
    const server = getTestServer();
    data = server.data;
  });

  async function createImport() {
    const op = await data.tenantOperations!.create({
      tenant_id: "tenant-a",
      kind: "users_import",
      engine: "inline",
      input: { connection_id: "con_1", upsert: true },
    });
    return op;
  }

  it("stages more rows than fit in one insert statement", async () => {
    const adapter = data.tenantOperationRows!;
    expect(adapter).toBeDefined();

    const op = await createImport();

    // 127 > the 50-row insert chunk, so this must span three statements.
    const written = await adapter.createMany(stageRows(op.id, 127));
    expect(written).toBe(127);

    const counts = await adapter.countByStatus(op.id);
    expect(counts.total).toBe(127);
    expect(counts.pending).toBe(127);

    const first = await adapter.claimPending(op.id, 10);
    expect(first).toHaveLength(10);
    expect(first.map((r) => r.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(first[0]!.payload).toEqual({ email: "user-0@example.com" });
    expect(first[0]!.status).toBe("pending");

    // The last staged row survived the final chunk.
    const listed = await adapter.list(op.id, { page: 12, per_page: 10 });
    expect(listed.rows).toHaveLength(7);
    expect(listed.rows.at(-1)!.seq).toBe(126);

    expect(await adapter.createMany([])).toBe(0);
  });

  it("records outcomes idempotently and never overwrites a terminal status", async () => {
    const adapter = data.tenantOperationRows!;
    const op = await createImport();
    await adapter.createMany(stageRows(op.id, 4));

    const outcomes = [
      { seq: 0, status: "inserted" as const, entity_id: "user-0" },
      { seq: 1, status: "updated" as const, entity_id: "user-1" },
      {
        seq: 2,
        status: "failed" as const,
        error_code: "UNSUPPORTED_HASH_ALGORITHM",
        error_message: "bcrypt only",
        error_path: "custom_password_hash.algorithm",
      },
    ];

    expect(await adapter.recordOutcomes(op.id, outcomes)).toBe(3);

    // Replaying the exact chunk commits nothing more.
    expect(await adapter.recordOutcomes(op.id, outcomes)).toBe(0);

    // And a *different* outcome for an already-terminal row is refused too.
    expect(
      await adapter.recordOutcomes(op.id, [
        { seq: 0, status: "failed", error_code: "CLOBBERED" },
      ]),
    ).toBe(0);

    const all = await adapter.list(op.id);
    expect(all.rows.map((r) => r.status)).toEqual([
      "inserted",
      "updated",
      "failed",
      "pending",
    ]);
    expect(all.rows[0]!.entity_id).toBe("user-0");
    expect(all.rows[0]!.error_code).toBeNull();
    expect(all.rows[2]!.error_code).toBe("UNSUPPORTED_HASH_ALGORITHM");
    expect(all.rows[2]!.error_path).toBe("custom_password_hash.algorithm");
    expect(all.rows[0]!.updated_at >= all.rows[0]!.created_at).toBe(true);

    // Only the untouched row is still claimable.
    const pending = await adapter.claimPending(op.id, 10);
    expect(pending.map((r) => r.seq)).toEqual([3]);

    expect(await adapter.recordOutcomes(op.id, [])).toBe(0);
  });

  it("commits outcomes across more items than fit in one batch", async () => {
    const adapter = data.tenantOperationRows!;
    const op = await createImport();
    await adapter.createMany(stageRows(op.id, 120));

    const outcomes = Array.from({ length: 120 }, (_, seq) => ({
      seq,
      status: "inserted" as const,
      entity_id: `user-${seq}`,
    }));
    expect(await adapter.recordOutcomes(op.id, outcomes)).toBe(120);
    expect(await adapter.recordOutcomes(op.id, outcomes)).toBe(0);

    const counts = await adapter.countByStatus(op.id);
    expect(counts).toEqual({
      total: 120,
      pending: 0,
      inserted: 120,
      updated: 0,
      failed: 0,
      skipped: 0,
    });
  });

  it("counts every status in one pass", async () => {
    const adapter = data.tenantOperationRows!;
    const op = await createImport();
    await adapter.createMany(stageRows(op.id, 6));

    await adapter.recordOutcomes(op.id, [
      { seq: 0, status: "inserted" },
      { seq: 1, status: "inserted" },
      { seq: 2, status: "updated" },
      { seq: 3, status: "failed", error_code: "BAD_EMAIL" },
      { seq: 4, status: "skipped" },
    ]);

    expect(await adapter.countByStatus(op.id)).toEqual({
      total: 6,
      pending: 1,
      inserted: 2,
      updated: 1,
      failed: 1,
      skipped: 1,
    });

    expect(await adapter.countByStatus("op_missing")).toEqual({
      total: 0,
      pending: 0,
      inserted: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
    });
  });

  it("lists by seq with status filters and pagination", async () => {
    const adapter = data.tenantOperationRows!;
    const op = await createImport();
    await adapter.createMany(stageRows(op.id, 5));

    await adapter.recordOutcomes(op.id, [
      { seq: 0, status: "failed", error_code: "BAD_EMAIL" },
      { seq: 1, status: "inserted" },
      { seq: 2, status: "failed", error_code: "DUPLICATE" },
      { seq: 3, status: "skipped" },
    ]);

    const failed = await adapter.list(op.id, { status: "failed" });
    expect(failed.rows.map((r) => r.seq)).toEqual([0, 2]);
    expect(failed.start).toBe(0);
    expect(failed.limit).toBe(50);
    expect(failed.length).toBe(2);

    const terminal = await adapter.list(op.id, {
      status: ["failed", "skipped"],
    });
    expect(terminal.rows.map((r) => r.seq)).toEqual([0, 2, 3]);

    const page = await adapter.list(op.id, { page: 1, per_page: 2 });
    expect(page.start).toBe(2);
    expect(page.rows.map((r) => r.seq)).toEqual([2, 3]);

    // Rows are scoped to their own operation.
    const other = await createImport();
    await adapter.createMany(stageRows(other.id, 2));
    expect((await adapter.list(op.id)).rows).toHaveLength(5);
    expect((await adapter.list(other.id)).rows).toHaveLength(2);
  });

  it("removes rows for one operation and cascades from the parent", async () => {
    const adapter = data.tenantOperationRows!;
    const op = await createImport();
    const other = await createImport();
    await adapter.createMany(stageRows(op.id, 3));
    await adapter.createMany(stageRows(other.id, 2));

    expect(await adapter.removeByOperation(op.id)).toBe(3);
    expect(await adapter.removeByOperation(op.id)).toBe(0);
    expect((await adapter.list(other.id)).rows).toHaveLength(2);
  });
});

describe("tenantOperations leases", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(() => {
    const server = getTestServer();
    data = server.data;
  });

  it("round-trips input and result as JSON", async () => {
    const adapter = data.tenantOperations!;

    const created = await adapter.create({
      tenant_id: "tenant-a",
      kind: "users_import",
      engine: "inline",
      input: { connection_id: "con_1", upsert: true },
    });
    expect(created.input).toEqual({ connection_id: "con_1", upsert: true });
    expect(created.result).toBeNull();

    await adapter.update(created.id, {
      result: { total: 3, inserted: 2, updated: 0, failed: 1 },
    });
    const fetched = await adapter.get(created.id);
    expect(fetched!.result).toEqual({
      total: 3,
      inserted: 2,
      updated: 0,
      failed: 1,
    });
    expect(fetched!.input).toEqual({ connection_id: "con_1", upsert: true });

    const bare = await adapter.create({
      tenant_id: "tenant-a",
      kind: "seed",
      engine: "inline",
    });
    expect(bare.input).toBeNull();
  });

  it("lets only one live worker hold the lease, and reclaims it after expiry", async () => {
    const adapter = data.tenantOperations!;
    const op = await adapter.create({
      tenant_id: "tenant-a",
      kind: "users_import",
      engine: "inline",
    });

    expect(await adapter.claim(op.id, "worker-1", 60_000)).toBe(true);
    // The holder may re-claim (lease renewal) ...
    expect(await adapter.claim(op.id, "worker-1", 60_000)).toBe(true);
    // ... but a second worker is locked out while the lease is live.
    expect(await adapter.claim(op.id, "worker-2", 60_000)).toBe(false);

    const held = await adapter.get(op.id);
    expect(held!.claimed_by).toBe("worker-1");
    expect(held!.claim_expires_at).not.toBeNull();

    // Expire the lease by writing a past expiry, as a crashed worker leaves it.
    await adapter.update(op.id, {
      claim_expires_at: "2000-01-01T00:00:00.000Z",
    });
    expect(await adapter.claim(op.id, "worker-2", 60_000)).toBe(true);
    expect((await adapter.get(op.id))!.claimed_by).toBe("worker-2");

    // Only the current holder can release.
    expect(await adapter.release(op.id, "worker-1")).toBe(false);
    expect(await adapter.release(op.id, "worker-2")).toBe(true);

    const released = await adapter.get(op.id);
    expect(released!.claimed_by).toBeNull();
    expect(released!.claim_expires_at).toBeNull();

    expect(await adapter.claim("op_missing", "worker-1", 60_000)).toBe(false);
  });

  it("lists resumable operations by kind, skipping live leases", async () => {
    const adapter = data.tenantOperations!;

    const pending = await adapter.create({
      tenant_id: "tenant-a",
      kind: "users_import",
      engine: "inline",
    });
    const running = await adapter.create({
      tenant_id: "tenant-b",
      kind: "users_import",
      engine: "inline",
    });
    await adapter.update(running.id, { status: "running" });
    const done = await adapter.create({
      tenant_id: "tenant-c",
      kind: "users_import",
      engine: "inline",
    });
    await adapter.update(done.id, { status: "succeeded" });
    const otherKind = await adapter.create({
      tenant_id: "tenant-d",
      kind: "provision",
      engine: "inline",
    });

    const resumable = await adapter.listResumable({
      kind: "users_import",
      limit: 10,
    });
    expect(resumable.map((o) => o.id).sort()).toEqual(
      [pending.id, running.id].sort(),
    );
    expect(resumable.map((o) => o.id)).not.toContain(done.id);
    expect(resumable.map((o) => o.id)).not.toContain(otherKind.id);

    // A live lease hides the operation from the sweep ...
    expect(await adapter.claim(running.id, "worker-1", 60_000)).toBe(true);
    const afterClaim = await adapter.listResumable({
      kind: "users_import",
      limit: 10,
    });
    expect(afterClaim.map((o) => o.id)).toEqual([pending.id]);

    // ... an expired one hands it back.
    await adapter.update(running.id, {
      claim_expires_at: "2000-01-01T00:00:00.000Z",
    });
    const afterExpiry = await adapter.listResumable({
      kind: "users_import",
      limit: 10,
    });
    expect(afterExpiry.map((o) => o.id).sort()).toEqual(
      [pending.id, running.id].sort(),
    );

    expect(
      await adapter.listResumable({ kind: "users_import", limit: 1 }),
    ).toHaveLength(1);
  });
});

describe("non-control-plane databases", () => {
  it("omits tenantOperationRows on tenant databases", () => {
    const { data } = getTestServer({ controlPlane: false });
    expect(data.tenantOperationRows).toBeUndefined();
  });
});
