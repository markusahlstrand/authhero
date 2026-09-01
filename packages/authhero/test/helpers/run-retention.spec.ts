import { describe, it, expect, vi } from "vitest";
import type { DataAdapters } from "@authhero/adapter-interfaces";
import {
  runRetention,
  RetentionSweepError,
} from "../../src/helpers/run-retention";

function makeDataAdapter(
  overrides: {
    codesCleanup?: ReturnType<typeof vi.fn>;
    outboxCleanup?: ReturnType<typeof vi.fn> | null;
    actionExecutionsCleanup?: ReturnType<typeof vi.fn> | null;
    sessionCleanup?: ReturnType<typeof vi.fn> | null;
  } = {},
): DataAdapters {
  const {
    codesCleanup = vi.fn().mockResolvedValue(5),
    outboxCleanup = vi.fn().mockResolvedValue(3),
    actionExecutionsCleanup = vi.fn().mockResolvedValue(4),
    sessionCleanup = vi.fn().mockResolvedValue(undefined),
  } = overrides;

  return {
    codes: { cleanup: codesCleanup },
    outbox: outboxCleanup ? { cleanup: outboxCleanup } : undefined,
    actionExecutions: actionExecutionsCleanup
      ? { cleanup: actionExecutionsCleanup }
      : {},
    sessionCleanup: sessionCleanup ?? undefined,
  } as unknown as DataAdapters;
}

/** Days between `now` and an ISO cutoff string, rounded to the nearest day. */
function daysAgo(cutoff: string): number {
  return Math.round((Date.now() - new Date(cutoff).getTime()) / 86_400_000);
}

describe("runRetention", () => {
  it("sweeps codes, outbox, action executions and sessions in one call", async () => {
    const codesCleanup = vi.fn().mockResolvedValue(5);
    const outboxCleanup = vi.fn().mockResolvedValue(3);
    const actionExecutionsCleanup = vi.fn().mockResolvedValue(4);
    const sessionCleanup = vi.fn().mockResolvedValue(undefined);
    const dataAdapter = makeDataAdapter({
      codesCleanup,
      outboxCleanup,
      actionExecutionsCleanup,
      sessionCleanup,
    });

    const { sweeps } = await runRetention({ dataAdapter });

    expect(codesCleanup).toHaveBeenCalledTimes(1);
    expect(outboxCleanup).toHaveBeenCalledTimes(1);
    expect(actionExecutionsCleanup).toHaveBeenCalledTimes(1);
    expect(sessionCleanup).toHaveBeenCalledTimes(1);

    expect(sweeps).toEqual([
      { table: "codes", status: "swept", deleted: 5 },
      { table: "outbox_events", status: "swept", deleted: 3 },
      { table: "action_executions", status: "swept", deleted: 4 },
      {
        // The mock adapter has no tenantOperations, so bulk-import jobs are
        // reported unsupported rather than swept.
        table: "tenant_operations (users_import)",
        status: "skipped",
        reason: "not supported by this adapter",
      },
      {
        table: "sessions, refresh_tokens, login_sessions",
        status: "swept",
        deleted: undefined,
      },
    ]);
  });

  it("applies the documented default windows", async () => {
    const codesCleanup = vi.fn().mockResolvedValue(0);
    const outboxCleanup = vi.fn().mockResolvedValue(0);
    await runRetention({
      dataAdapter: makeDataAdapter({ codesCleanup, outboxCleanup }),
    });

    expect(daysAgo(codesCleanup.mock.calls[0][0])).toBe(1);
    expect(daysAgo(outboxCleanup.mock.calls[0][0])).toBe(7);
  });

  it("applies the documented default window for action executions", async () => {
    const actionExecutionsCleanup = vi.fn().mockResolvedValue(0);
    await runRetention({
      dataAdapter: makeDataAdapter({ actionExecutionsCleanup }),
    });

    expect(daysAgo(actionExecutionsCleanup.mock.calls[0][0])).toBe(30);
  });

  it("honours per-table retention overrides", async () => {
    const codesCleanup = vi.fn().mockResolvedValue(0);
    const outboxCleanup = vi.fn().mockResolvedValue(0);
    const actionExecutionsCleanup = vi.fn().mockResolvedValue(0);
    await runRetention({
      dataAdapter: makeDataAdapter({
        codesCleanup,
        outboxCleanup,
        actionExecutionsCleanup,
      }),
      codesRetentionDays: 0,
      outboxRetentionDays: 30,
      actionExecutionsRetentionDays: 90,
    });

    expect(daysAgo(codesCleanup.mock.calls[0][0])).toBe(0);
    expect(daysAgo(outboxCleanup.mock.calls[0][0])).toBe(30);
    expect(daysAgo(actionExecutionsCleanup.mock.calls[0][0])).toBe(90);
  });

  it("skips action executions when the adapter has no cleanup", async () => {
    const { sweeps } = await runRetention({
      dataAdapter: makeDataAdapter({ actionExecutionsCleanup: null }),
    });

    expect(sweeps.find((s) => s.table === "action_executions")).toEqual({
      table: "action_executions",
      status: "skipped",
      reason: "not supported by this adapter",
    });
  });

  it("still sweeps codes and sessions when the outbox is disabled", async () => {
    const codesCleanup = vi.fn().mockResolvedValue(2);
    const sessionCleanup = vi.fn().mockResolvedValue(undefined);
    const { sweeps } = await runRetention({
      dataAdapter: makeDataAdapter({
        codesCleanup,
        outboxCleanup: null,
        sessionCleanup,
      }),
    });

    expect(codesCleanup).toHaveBeenCalledTimes(1);
    expect(sessionCleanup).toHaveBeenCalledTimes(1);
    expect(sweeps.find((s) => s.table === "outbox_events")).toEqual({
      table: "outbox_events",
      status: "skipped",
      reason: "not supported by this adapter",
    });
  });

  it("skips sessions when the adapter does not implement sessionCleanup", async () => {
    const { sweeps } = await runRetention({
      dataAdapter: makeDataAdapter({ sessionCleanup: null }),
    });

    expect(
      sweeps.find(
        (s) => s.table === "sessions, refresh_tokens, login_sessions",
      ),
    ).toEqual({
      table: "sessions, refresh_tokens, login_sessions",
      status: "skipped",
      reason: "not supported by this adapter",
    });
  });

  it("scopes the session sweep to a tenant when asked", async () => {
    const sessionCleanup = vi.fn().mockResolvedValue(undefined);
    await runRetention({
      dataAdapter: makeDataAdapter({ sessionCleanup }),
      tenantId: "tenant-1",
    });

    expect(sessionCleanup).toHaveBeenCalledWith({ tenant_id: "tenant-1" });
  });

  it("sweeps sessions globally when no tenant is given", async () => {
    const sessionCleanup = vi.fn().mockResolvedValue(undefined);
    await runRetention({ dataAdapter: makeDataAdapter({ sessionCleanup }) });

    expect(sessionCleanup).toHaveBeenCalledWith(undefined);
  });

  it("runs every remaining sweep when one throws, then reports the failure", async () => {
    const boom = new Error("codes adapter is broken");
    const codesCleanup = vi.fn().mockRejectedValue(boom);
    const outboxCleanup = vi.fn().mockResolvedValue(3);
    const sessionCleanup = vi.fn().mockResolvedValue(undefined);
    const dataAdapter = makeDataAdapter({
      codesCleanup,
      outboxCleanup,
      sessionCleanup,
    });

    // The whole point of the structural sweep: a broken adapter method must
    // not stop the other tables being pruned.
    await expect(runRetention({ dataAdapter })).rejects.toThrow(
      RetentionSweepError,
    );
    expect(outboxCleanup).toHaveBeenCalledTimes(1);
    expect(sessionCleanup).toHaveBeenCalledTimes(1);
  });

  it("carries the partial result and the underlying errors on the thrown error", async () => {
    const boom = new Error("outbox adapter is broken");
    const dataAdapter = makeDataAdapter({
      codesCleanup: vi.fn().mockResolvedValue(5),
      outboxCleanup: vi.fn().mockRejectedValue(boom),
    });

    const error = await runRetention({ dataAdapter }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RetentionSweepError);
    if (!(error instanceof RetentionSweepError)) {
      throw new Error("expected a RetentionSweepError");
    }
    expect(error.errors).toEqual([boom]);
    expect(error.message).toContain("outbox_events");
    expect(error.result.sweeps[0]).toEqual({
      table: "codes",
      status: "swept",
      deleted: 5,
    });
    expect(error.result.sweeps[1]).toMatchObject({
      table: "outbox_events",
      status: "failed",
      error: boom,
    });
  });
});
