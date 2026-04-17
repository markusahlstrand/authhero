import {
  CodeExecutionResult,
  CodeExecutor,
} from "@authhero/adapter-interfaces";

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

  // Define the API shape per trigger type
  const apiShapes: Record<string, Record<string, string[]>> = {
    "post-user-login": {},
    "credentials-exchange": {
      accessToken: ["setCustomClaim"],
      idToken: ["setCustomClaim"],
      access: ["deny"],
    },
    "pre-user-registration": {
      user: ["setUserMetadata", "setLinkedTo"],
      access: ["deny"],
    },
    "post-user-registration": {},
  };

  const shape = apiShapes[triggerId] || {};
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
        };
      }

      // Build the function from user code.
      // The user code is expected to use `exports.onExecuteXxx = async (event, api) => { ... }`
      // We wrap it so the exports object is available and then call the function.
      const wrappedCode = `
        const exports = {};
        ${params.code}
        if (typeof exports.${fnName} !== 'function') {
          throw new Error('Expected export exports.${fnName} not found');
        }
        return exports.${fnName}(event, api);
      `;

      const fn = new Function("event", "api", wrappedCode);
      await fn(params.event, api);

      return {
        success: true,
        durationMs: Date.now() - start,
        apiCalls: getCalls(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        apiCalls: getCalls(),
      };
    }
  }
}
