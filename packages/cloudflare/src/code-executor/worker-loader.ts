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
export interface WorkerLoader {
  load(code: WorkerCode): WorkerStub;
  get(id: string, callback: () => Promise<WorkerCode>): WorkerStub;
}

export interface WorkerCode {
  compatibilityDate: string;
  mainModule: string;
  modules: Record<string, string>;
}

export interface WorkerStub {
  getEntrypoint(): { fetch(request: Request): Promise<Response> };
}

export interface WorkerLoaderCodeExecutorOptions {
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
  "post-user-login": {
    accessToken: ["setCustomClaim"],
    idToken: ["setCustomClaim"],
    access: ["deny"],
    prompt: ["render"],
    redirect: ["sendUserTo"],
  },
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
 * SHA-256 digest of the code, hex-encoded. Used as part of the worker cache key
 * so any change to the code produces a distinct id and avoids stale worker reuse.
 */
async function computeCodeDigest(str: string): Promise<string> {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const byte of view) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Builds a self-contained Worker module string that wraps user code.
 * The Worker accepts POST { event, triggerId } and returns CodeExecutionResult.
 */
function buildWorkerScript(userCode: string): string {
  return `
const TRIGGER_FN_NAMES = ${JSON.stringify(TRIGGER_FN_NAMES)};
const API_SHAPES = ${JSON.stringify(API_SHAPES)};
const MAX_LOG_ENTRIES = 50;
const MAX_LOG_LENGTH = 500;

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

function createCapturingConsole(logs) {
  function format(args) {
    return args.map(function(a) {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(" ").slice(0, MAX_LOG_LENGTH);
  }
  function push(level, args) {
    if (logs.length >= MAX_LOG_ENTRIES) return;
    logs.push({ level: level, message: format(args) });
  }
  return {
    log: function() { push("log", [].slice.call(arguments)); },
    info: function() { push("info", [].slice.call(arguments)); },
    warn: function() { push("warn", [].slice.call(arguments)); },
    error: function() { push("error", [].slice.call(arguments)); },
    debug: function() { push("debug", [].slice.call(arguments)); },
  };
}

// Load user code in its own scope so it cannot access recording internals.
// The local \`console\` shadows the global so user code's console.* calls are captured.
function loadUserExports(console) {
  const exports = {};
  ${userCode}
  return exports;
}

export default {
  async fetch(request) {
    const start = Date.now();
    const logs = [];
    try {
      const { event, triggerId } = await request.json();
      const fnName = TRIGGER_FN_NAMES[triggerId];
      if (!fnName) {
        return Response.json({
          success: false,
          error: "Unknown trigger: " + triggerId,
          durationMs: Date.now() - start,
          apiCalls: [],
          logs: logs,
        });
      }

      const { api, getCalls } = createRecordingApiProxy(triggerId);
      const capturedConsole = createCapturingConsole(logs);
      const exports = loadUserExports(capturedConsole);

      if (typeof exports[fnName] !== "function") {
        return Response.json({
          success: false,
          error: "Expected export exports." + fnName + " not found",
          durationMs: Date.now() - start,
          apiCalls: [],
          logs: logs,
        });
      }

      await exports[fnName](event, api);

      return Response.json({
        success: true,
        durationMs: Date.now() - start,
        apiCalls: getCalls(),
        logs: logs,
      });
    } catch (err) {
      return Response.json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        apiCalls: [],
        logs: logs,
      });
    }
  },
};
`;
}

/**
 * Cloudflare Dynamic Workers code executor (Worker Loader binding).
 * Spins up isolated Workers on demand from in-memory code to execute
 * user-authored hook code in a sandboxed v8 isolate.
 *
 * Uses `env.LOADER.get(id, callback)` to cache workers by hookCodeId + code hash,
 * so the same code stays warm across requests while code updates get a fresh worker.
 *
 * User code can make outbound `fetch()` calls. The Worker Loader still provides
 * process isolation (separate v8 isolate, no access to the parent worker's
 * bindings or env), so this only widens the network boundary, not the host
 * boundary. Plan: a future AI/static-analysis layer inspects action code on
 * upload to flag exfiltration patterns before they reach the executor.
 *
 * Contrast with `DispatchNamespaceCodeExecutor`, which uses Workers for
 * Platforms dispatch namespaces and requires user code to be pre-deployed
 * as individual worker scripts via the Cloudflare API.
 */
export class WorkerLoaderCodeExecutor implements CodeExecutor {
  private loader: WorkerLoader;
  private compatibilityDate: string;

  constructor(options: WorkerLoaderCodeExecutorOptions) {
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

    // timeoutMs / cpuLimitMs are not enforceable through the Worker Loader
    // API today; accept and ignore so callers that pass a default value
    // (e.g. handleCodeHook) don't fail before the worker is even spawned.

    try {
      const workerScript = buildWorkerScript(params.code);

      const workerCode: WorkerCode = {
        compatibilityDate: this.compatibilityDate,
        mainModule: "hook.js",
        modules: { "hook.js": workerScript },
      };

      // Use get() with a hash-based cache key when hookCodeId is available,
      // so the same code stays warm. Falls back to load() for one-off execution.
      const cacheId = params.hookCodeId
        ? `${params.hookCodeId}-${await computeCodeDigest(params.code)}`
        : null;

      const worker = cacheId
        ? this.loader.get(cacheId, async () => workerCode)
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
