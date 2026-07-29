import {
  CodeExecutionLog,
  CodeExecutionResult,
  CodeExecutor,
  TRIGGER_API_SHAPES,
} from "@authhero/adapter-interfaces";

const MAX_LOG_ENTRIES = 50;
const MAX_LOG_LENGTH = 500;

function createCapturingConsole(logs: CodeExecutionLog[]) {
  const format = (args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ")
      .slice(0, MAX_LOG_LENGTH);
  const push = (level: CodeExecutionLog["level"], args: unknown[]) => {
    if (logs.length >= MAX_LOG_ENTRIES) return;
    logs.push({ level, message: format(args) });
  };
  return {
    log: (...args: unknown[]) => push("log", args),
    info: (...args: unknown[]) => push("info", args),
    warn: (...args: unknown[]) => push("warn", args),
    error: (...args: unknown[]) => push("error", args),
    debug: (...args: unknown[]) => push("debug", args),
  };
}

/**
 * Creates a recording API proxy that captures method calls for later replay.
 * Each call to a nested method (e.g., api.accessToken.setCustomClaim("x", "y"))
 * is recorded as { method: "accessToken.setCustomClaim", args: ["x", "y"] }.
 */
function createRecordingApiProxy(triggerId: string): {
  api: Record<string, unknown>;
  getCalls: () => Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  // Per-trigger API shape is shared with the production (Worker Loader)
  // executor via `TRIGGER_API_SHAPES` so the two can never drift.
  const shape = TRIGGER_API_SHAPES[triggerId] || {};
  const api: Record<string, unknown> = {};

  for (const [namespace, methods] of Object.entries(shape)) {
    const nsObj: Record<string, (...args: unknown[]) => void> = {};
    for (const method of methods) {
      nsObj[method] = (...args: unknown[]) => {
        calls.push({ method: `${namespace}.${method}`, args });
      };
    }
    api[namespace] = nsObj;
  }

  return { api, getCalls: () => calls };
}

/**
 * Local code executor using `new Function()`.
 * Suitable for local development only — no isolation or sandboxing.
 */
export class LocalCodeExecutor implements CodeExecutor {
  async execute(params: {
    code: string;
    triggerId: string;
    event: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<CodeExecutionResult> {
    const start = Date.now();
    const { api, getCalls } = createRecordingApiProxy(params.triggerId);
    const logs: CodeExecutionLog[] = [];
    const capturedConsole = createCapturingConsole(logs);

    try {
      // Map trigger ID to the expected export function name
      const fnNames: Record<string, string> = {
        "post-user-login": "onExecutePostLogin",
        "credentials-exchange": "onExecuteCredentialsExchange",
        "pre-user-registration": "onExecutePreUserRegistration",
        "post-user-registration": "onExecutePostUserRegistration",
      };

      const fnName = fnNames[params.triggerId];
      if (!fnName) {
        return {
          success: false,
          error: `Unknown trigger: ${params.triggerId}`,
          durationMs: Date.now() - start,
          apiCalls: [],
          logs,
        };
      }

      // Build the function from user code. The user code is expected to use
      // `exports.onExecuteXxx = async (event, api) => { ... }`. The local
      // `console` parameter shadows the global so user code's console.* calls
      // are captured rather than written to the host stdout.
      const wrappedCode = `
        const exports = {};
        ${params.code}
        if (typeof exports.${fnName} !== 'function') {
          throw new Error('Expected export exports.${fnName} not found');
        }
        return exports.${fnName}(event, api);
      `;

      const fn = new Function("event", "api", "console", wrappedCode);
      await fn(params.event, api, capturedConsole);

      return {
        success: true,
        durationMs: Date.now() - start,
        apiCalls: getCalls(),
        logs,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        apiCalls: getCalls(),
        logs,
      };
    }
  }
}
