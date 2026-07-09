import { describe, it, expect, vi, type Mock } from "vitest";
import type {
  ActionExecutionResult,
  AuditEvent,
  CodeExecutionResult,
  CodeExecutor,
} from "@authhero/adapter-interfaces";
import { CodeHookDestination } from "../../../src/helpers/outbox-destinations/code-hooks";
import type { CodeHookData } from "../../../src/hooks/codehooks";

/** Minimal hook shape the destination reads (enabled + trigger + code/url). */
type MockHook = {
  hook_id?: string;
  code_id?: string;
  url?: string;
  enabled: boolean;
  trigger_id: string;
};

/** Captured `action_executions.create` record. */
type CreatedExecution = {
  trigger_id: string;
  status: string;
  results: ActionExecutionResult[];
};

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    tenant_id: "tenant-1",
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: {
      type: "user",
      id: "user-1",
      after: { user_id: "user-1", email: "a@b.test" },
    },
    request: { method: "POST", path: "/users", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Build a data adapter mock where `hooks.list` returns `hooks`, code is
 * resolved from `hookCode.get`, and action executions are captured.
 */
function makeData(
  hooks: MockHook[],
  code = "module.exports = async () => {};",
) {
  const created: CreatedExecution[] = [];
  const data = {
    hooks: { list: vi.fn().mockResolvedValue({ hooks }) },
    actions: { get: vi.fn().mockResolvedValue(null), list: vi.fn() },
    hookCode: { get: vi.fn().mockResolvedValue({ code, secrets: {} }) },
    actionExecutions: {
      create: vi.fn(async (_tenantId: string, rec: CreatedExecution) => {
        created.push(rec);
      }),
    },
  } as unknown as CodeHookData;
  return { data, created };
}

function makeExecutor(
  result: Partial<
    Pick<CodeExecutionResult, "success" | "error" | "apiCalls" | "logs">
  > = {},
): CodeExecutor & { execute: Mock<CodeExecutor["execute"]> } {
  const execute = vi.fn<CodeExecutor["execute"]>().mockResolvedValue({
    success: result.success ?? true,
    error: result.error,
    durationMs: 1,
    apiCalls: result.apiCalls ?? [],
    logs: result.logs ?? [],
  });
  return { execute };
}

const codeHook = {
  hook_id: "h1",
  code_id: "code-1",
  enabled: true,
  trigger_id: "post-user-registration",
};

describe("CodeHookDestination", () => {
  it("accepts hook.* events and rejects the rest", () => {
    const { data } = makeData([]);
    const dest = new CodeHookDestination(data, makeExecutor());

    expect(dest.accepts(makeEvent())).toBe(true);
    expect(dest.accepts(makeEvent({ event_type: "hook.post-user-deletion" }))).toBe(
      true,
    );
    expect(dest.accepts(makeEvent({ event_type: "user.created" }))).toBe(false);
  });

  it("is a no-op when no code executor is configured", async () => {
    const { data } = makeData([codeHook]);
    const dest = new CodeHookDestination(data, undefined);

    await dest.deliver([dest.transform(makeEvent())]);

    expect(data.hooks.list).not.toHaveBeenCalled();
    expect(data.actionExecutions.create).not.toHaveBeenCalled();
  });

  it("runs matching enabled code hooks and persists the execution", async () => {
    const { data, created } = makeData([codeHook]);
    const executor = makeExecutor({ success: true });
    const dest = new CodeHookDestination(data, executor);

    await dest.deliver([dest.transform(makeEvent())]);

    expect(executor.execute).toHaveBeenCalledTimes(1);
    const execArg = executor.execute.mock.calls[0][0];
    expect(execArg.triggerId).toBe("post-user-registration");
    // The serialized user snapshot comes from the audit event's target.after.
    expect(execArg.event.user).toEqual({ user_id: "user-1", email: "a@b.test" });
    // The outbox event id is exposed for at-least-once dedupe.
    expect(execArg.event.idempotency_key).toBe("evt-1");

    expect(created).toHaveLength(1);
    expect(created[0].trigger_id).toBe("post-user-registration");
    expect(created[0].status).toBe("final");
  });

  it("skips webhook (url) hooks and hooks for other triggers", async () => {
    const { data } = makeData([
      { hook_id: "w1", url: "https://x.test", enabled: true, trigger_id: "post-user-registration" },
      { ...codeHook, trigger_id: "post-user-login" },
      { ...codeHook, hook_id: "h2", code_id: "code-2", enabled: false },
    ]);
    const executor = makeExecutor();
    const dest = new CodeHookDestination(data, executor);

    await dest.deliver([dest.transform(makeEvent())]);

    expect(executor.execute).not.toHaveBeenCalled();
    expect(data.actionExecutions.create).not.toHaveBeenCalled();
  });

  it("throws when a code hook fails so the relay retries, but still persists the record", async () => {
    const { data, created } = makeData([codeHook]);
    const executor = makeExecutor({ success: false, error: "boom" });
    const dest = new CodeHookDestination(data, executor);

    await expect(dest.deliver([dest.transform(makeEvent())])).rejects.toThrow(
      /code hook\(s\) failed for post-user-registration/,
    );

    // The execution record is written before the throw so failures are visible.
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe("partial");
  });

  it("records a thrown executor as execution_threw and retries", async () => {
    const { data, created } = makeData([codeHook]);
    const executor: CodeExecutor = {
      execute: vi
        .fn<CodeExecutor["execute"]>()
        .mockRejectedValue(new Error("executor exploded")),
    };
    const dest = new CodeHookDestination(data, executor);

    await expect(dest.deliver([dest.transform(makeEvent())])).rejects.toThrow(
      /executor exploded/,
    );
    expect(created).toHaveLength(1);
    expect(created[0].results[0].error?.id).toBe("execution_threw");
  });
});
