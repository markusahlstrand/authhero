import { describe, it, expect } from "vitest";
import {
  ActionExecutionInsert,
  ActionExecutionLogs,
  DataAdapters,
} from "@authhero/adapter-interfaces";
import {
  MAX_PERSISTED_LOG_CHARS,
  capActionExecutionLogs,
  persistActionExecution,
  type HandleCodeHookOutcome,
} from "../../src/hooks/codehooks";

const TRUNCATION_MARKER = "[authhero] console output truncated at";

function totalChars(logs: ActionExecutionLogs): number {
  return logs.reduce(
    (sum, entry) =>
      sum +
      entry.lines
        .filter((line) => !line.message.startsWith("[authhero] "))
        .reduce((n, line) => n + line.message.length, 0),
    0,
  );
}

function outcome(
  action_name: string,
  messages: string[],
): HandleCodeHookOutcome {
  return {
    result: {
      action_name,
      error: null,
      started_at: "2026-01-01T00:00:00.000Z",
      ended_at: "2026-01-01T00:00:01.000Z",
    },
    logs: messages.map((message) => ({ level: "log" as const, message })),
    denied: false,
  };
}

describe("capActionExecutionLogs", () => {
  it("leaves output inside the budget untouched", () => {
    const logs: ActionExecutionLogs = [
      {
        action_name: "a",
        lines: [
          { level: "log", message: "short" },
          { level: "error", message: "also short" },
        ],
      },
    ];

    expect(capActionExecutionLogs(logs)).toEqual(logs);
  });

  it("truncates at the budget and marks the record explicitly", () => {
    const logs: ActionExecutionLogs = [
      {
        action_name: "a",
        lines: [
          { level: "log", message: "x".repeat(200) },
          { level: "log", message: "y".repeat(200) },
          { level: "log", message: "z".repeat(200) },
        ],
      },
    ];

    const capped = capActionExecutionLogs(logs);

    // 200 + 56 characters of the second line = the 256-char budget.
    expect(totalChars(capped)).toBe(MAX_PERSISTED_LOG_CHARS);
    expect(capped[0]!.lines[0]!.message).toBe("x".repeat(200));
    expect(capped[0]!.lines[1]!.message).toBe("y".repeat(56));

    const marker = capped[0]!.lines.at(-1)!;
    expect(marker.level).toBe("warn");
    expect(marker.message).toContain(TRUNCATION_MARKER);
    // The third line was dropped whole, the second cut mid-line.
    expect(marker.message).toContain("600 captured");
    expect(marker.message).toContain("2 line(s)");
  });

  it("spends the budget across actions in order, not per action", () => {
    const logs: ActionExecutionLogs = [
      { action_name: "a", lines: [{ level: "log", message: "a".repeat(300) }] },
      { action_name: "b", lines: [{ level: "log", message: "b".repeat(300) }] },
    ];

    const capped = capActionExecutionLogs(logs);

    // The second action's output is dropped entirely, so its entry is gone.
    expect(capped).toHaveLength(1);
    expect(capped[0]!.action_name).toBe("a");
    expect(totalChars(capped)).toBe(MAX_PERSISTED_LOG_CHARS);
    expect(capped[0]!.lines.at(-1)!.message).toContain(TRUNCATION_MARKER);
  });

  it("honours an explicit budget", () => {
    const logs: ActionExecutionLogs = [
      { action_name: "a", lines: [{ level: "log", message: "a".repeat(50) }] },
    ];

    expect(totalChars(capActionExecutionLogs(logs, 10))).toBe(10);
  });
});

/**
 * Minimal in-memory stand-in for the only adapter slice
 * `persistActionExecution` touches, recording every write.
 */
function makeRecordingData() {
  const writes: Array<{ tenant_id: string; execution: ActionExecutionInsert }> =
    [];
  const data: Pick<DataAdapters, "actionExecutions"> = {
    actionExecutions: {
      async create(tenant_id, execution) {
        writes.push({ tenant_id, execution });
        return {
          ...execution,
          tenant_id,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        };
      },
      async get() {
        return null;
      },
    },
  };
  return { data, writes };
}

describe("persistActionExecution", () => {
  it("caps the console output it writes to action_executions", async () => {
    const { data, writes } = makeRecordingData();

    await persistActionExecution(data, "tenantId", "credentials-exchange", [
      outcome("noisy", [
        "CredentialsExchange: user email foo@example.com",
        "u".repeat(2000),
      ]),
    ]);

    expect(writes).toHaveLength(1);
    const { tenant_id, execution } = writes[0]!;
    expect(tenant_id).toBe("tenantId");
    expect(execution.trigger_id).toBe("credentials-exchange");
    expect(execution.status).toBe("final");

    const logs = execution.logs!;
    expect(totalChars(logs)).toBe(MAX_PERSISTED_LOG_CHARS);
    expect(logs[0]!.lines.at(-1)!.message).toContain(TRUNCATION_MARKER);
  });

  it("writes short output through unchanged", async () => {
    const { data, writes } = makeRecordingData();

    await persistActionExecution(data, "tenantId", "post-user-login", [
      outcome("quiet", ["all good"]),
    ]);

    const { execution } = writes[0]!;
    // post-user-login is normalized to Auth0's post-login on write.
    expect(execution.trigger_id).toBe("post-login");
    expect(execution.logs).toEqual([
      { action_name: "quiet", lines: [{ level: "log", message: "all good" }] },
    ]);
  });
});
