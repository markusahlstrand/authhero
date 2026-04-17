import {
  CodeExecutionResult,
  CodeExecutor,
} from "@authhero/adapter-interfaces";

/**
 * Worker Loader binding type (Cloudflare Dynamic Workers).
 * Configure in wrangler.toml:
 *   [[worker_loaders]]
 *   binding = "LOADER"
 */
interface WorkerLoader {
  load(code: WorkerCode): WorkerStub;
  get(id: string, callback: () => WorkerCode): WorkerStub;
}

interface WorkerCode {
  compatibilityDate: string;
  mainModule: string;
  modules: Record<string, string>;
  globalOutbound?: null;
}

interface WorkerStub {
  getEntrypoint(): { fetch(request: Request): Promise<Response> };
}

interface CloudflareCodeExecutorOptions {
  loader: WorkerLoader;
  compatibilityDate?: string;
}

const TRIGGER_FN_NAMES: Record<string, string> = {
  "post-user-login": "onExecutePostLogin",
  "credentials-exchange": "onExecuteCredentialsExchange",
  "pre-user-registration": "onExecutePreUserRegistration",
  "post-user-registration": "onExecutePostUserRegistration",
};

const API_SHAPES: Record<string, Record<string, string[]>> = {
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

/**
 * Simple string hash for cache key differentiation.
 * Not cryptographic — just needs to be deterministic.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Builds a self-contained Worker module string that wraps user code.
 * The Worker accepts POST { event, triggerId } and returns CodeExecutionResult.
 */
function buildWorkerScript(userCode: string): string {
  return `
const TRIGGER_FN_NAMES = ${JSON.stringify(TRIGGER_FN_NAMES)};
const API_SHAPES = ${JSON.stringify(API_SHAPES)};

function createRecordingApiProxy(triggerId) {
  const calls = [];
  const shape = API_SHAPES[triggerId] || {};
  const api = {};
  for (const [namespace, methods] of Object.entries(shape)) {
    const nsObj = {};
    for (const method of methods) {
      nsObj[method] = (...args) => {
        calls.push({ method: namespace + "." + method, args });
      };
    }
    api[namespace] = nsObj;
  }
  return { api, getCalls: () => calls.map(function(c) { return { method: c.method, args: [].concat(c.args) }; }) };
}

// Load user code in its own scope so it cannot access recording internals
function loadUserExports() {
  const exports = {};
  ${userCode}
  return exports;
}

export default {
  async fetch(request) {
    const start = Date.now();
    try {
      const { event, triggerId } = await request.json();
      const fnName = TRIGGER_FN_NAMES[triggerId];
      if (!fnName) {
        return Response.json({
          success: false,
          error: "Unknown trigger: " + triggerId,
          durationMs: Date.now() - start,
          apiCalls: [],
        });
      }

      const { api, getCalls } = createRecordingApiProxy(triggerId);
      const exports = loadUserExports();

      if (typeof exports[fnName] !== "function") {
        return Response.json({
          success: false,
          error: "Expected export exports." + fnName + " not found",
          durationMs: Date.now() - start,
          apiCalls: [],
        });
      }

      await exports[fnName](event, api);

      return Response.json({
        success: true,
        durationMs: Date.now() - start,
        apiCalls: getCalls(),
      });
    } catch (err) {
      return Response.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        apiCalls: [],
      });
    }
  },
};
`;
}

/**
 * Cloudflare Dynamic Workers code executor.
 * Spins up isolated Workers on demand via the Worker Loader binding
 * to execute user-authored hook code in a sandboxed environment.
 *
 * Uses `env.LOADER.get(id, callback)` to cache workers by hookCodeId + code hash,
 * so the same code stays warm across requests while code updates get a fresh worker.
 * Network access is blocked via `globalOutbound: null`.
 */
export class CloudflareCodeExecutor implements CodeExecutor {
  private loader: WorkerLoader;
  private compatibilityDate: string;

  constructor(options: CloudflareCodeExecutorOptions) {
    this.loader = options.loader;
    this.compatibilityDate = options.compatibilityDate || "2025-01-01";
  }

  async execute(params: {
    code: string;
    hookCodeId?: string;
    triggerId: string;
    event: Record<string, unknown>;
    timeoutMs?: number;
    cpuLimitMs?: number;
  }): Promise<CodeExecutionResult> {
    const start = Date.now();

    try {
      const workerScript = buildWorkerScript(params.code);

      const workerCode: WorkerCode = {
        compatibilityDate: this.compatibilityDate,
        mainModule: "hook.js",
        modules: { "hook.js": workerScript },
        globalOutbound: null,
      };

      // Use get() with a hash-based cache key when hookCodeId is available,
      // so the same code stays warm. Falls back to load() for one-off execution.
      const cacheId = params.hookCodeId
        ? `${params.hookCodeId}-${simpleHash(params.code)}`
        : null;

      const worker = cacheId
        ? this.loader.get(cacheId, () => workerCode)
        : this.loader.load(workerCode);

      const response = await worker.getEntrypoint().fetch(
        new Request("https://hook/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: params.event,
            triggerId: params.triggerId,
          }),
        }),
      );

      const result: CodeExecutionResult = await response.json();
      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        apiCalls: [],
      };
    }
  }
}
