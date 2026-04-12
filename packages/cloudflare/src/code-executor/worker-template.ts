/**
 * Generates a Cloudflare Worker script that wraps user-authored code.
 *
 * The generated worker:
 * 1. Accepts POST requests with { triggerId, event }
 * 2. Creates a recording API proxy that captures method calls
 * 3. Runs the user's exported function (e.g., exports.onExecutePostLogin)
 * 4. Returns { success, apiCalls, error, durationMs } as JSON
 */
export function generateWorkerScript(userCode: string): string {
  return `// Auto-generated AuthHero code hook worker

const fnNames = {
  "post-user-login": "onExecutePostLogin",
  "credentials-exchange": "onExecuteCredentialsExchange",
  "pre-user-registration": "onExecutePreUserRegistration",
  "post-user-registration": "onExecutePostUserRegistration",
};

const apiShapes = {
  "post-user-login": {
    accessToken: ["setCustomClaim"],
    idToken: ["setCustomClaim"],
    access: ["deny"],
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

function createRecordingApiProxy(triggerId) {
  const calls = [];
  const shape = apiShapes[triggerId] || {};
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

  return { api, getCalls: () => calls };
}

// --- User code begins ---
const exports = {};
${userCode}
// --- User code ends ---

export default {
  async fetch(request) {
    const start = Date.now();

    if (request.method !== "POST") {
      return new Response(JSON.stringify({
        success: false,
        error: "Method not allowed",
        durationMs: Date.now() - start,
        apiCalls: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    try {
      const { triggerId, event } = await request.json();
      const fnName = fnNames[triggerId];

      if (!fnName) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unknown trigger: " + triggerId,
          durationMs: Date.now() - start,
          apiCalls: [],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      const { api, getCalls } = createRecordingApiProxy(triggerId);

      if (typeof exports[fnName] === "function") {
        await exports[fnName](event, api);
      }

      return new Response(JSON.stringify({
        success: true,
        durationMs: Date.now() - start,
        apiCalls: getCalls(),
      }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        apiCalls: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  },
};
`;
}
