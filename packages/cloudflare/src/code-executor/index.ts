import {
  CodeExecutionResult,
  CodeExecutor,
} from "@authhero/adapter-interfaces";
import { generateWorkerScript } from "./worker-template";

/**
 * Cloudflare Workers for Platforms dispatch namespace binding type.
 * This is the type of `env.DISPATCHER` when configured in wrangler.toml:
 *
 * ```toml
 * [[dispatch_namespaces]]
 * binding = "DISPATCHER"
 * namespace = "authhero-hooks"
 * ```
 */
export interface DispatchNamespace {
  get(
    name: string,
    options?: Record<string, unknown>,
    init?: { limits?: { cpuMs?: number; subrequests?: number } },
  ): {
    fetch(request: Request | string, init?: RequestInit): Promise<Response>;
  };
}

export interface CloudflareCodeExecutorConfig {
  /** Cloudflare account ID */
  accountId: string;

  /** API token with Workers Scripts write permission */
  apiToken: string;

  /** Dispatch namespace name (e.g., "authhero-hooks") */
  dispatchNamespace: string;

  /**
   * Dispatch namespace binding from the worker environment.
   * When running inside a Cloudflare Worker, pass `env.DISPATCHER`.
   * Enables low-latency same-origin invocation.
   */
  dispatcher?: DispatchNamespace;

  /**
   * Fallback URL for invoking user workers when no dispatcher binding is available.
   * The executor appends `/{scriptName}` to this URL.
   * Only used when `dispatcher` is not provided.
   */
  dispatchUrl?: string;
}

/**
 * Code executor that uses Cloudflare Workers for Platforms.
 *
 * User code is deployed as individual worker scripts in a dispatch namespace.
 * At execution time, the pre-deployed worker is invoked via the dispatch
 * namespace binding (in-worker) or via HTTP (external fallback).
 *
 * Usage:
 * ```typescript
 * const codeExecutor = new CloudflareCodeExecutor({
 *   accountId: env.CF_ACCOUNT_ID,
 *   apiToken: env.CF_API_TOKEN,
 *   dispatchNamespace: "authhero-hooks",
 *   dispatcher: env.DISPATCHER,
 * });
 *
 * const { app } = init({ dataAdapter, codeExecutor });
 * ```
 */
export class CloudflareCodeExecutor implements CodeExecutor {
  private config: CloudflareCodeExecutorConfig;

  constructor(config: CloudflareCodeExecutorConfig) {
    this.config = config;
  }

  async execute(params: {
    code: string;
    hookCodeId?: string;
    triggerId: string;
    event: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<CodeExecutionResult> {
    const start = Date.now();

    if (!params.hookCodeId) {
      return {
        success: false,
        error: "CloudflareCodeExecutor requires hookCodeId",
        durationMs: Date.now() - start,
        apiCalls: [],
      };
    }

    const scriptName = `hook-${params.hookCodeId}`;
    const body = JSON.stringify({
      triggerId: params.triggerId,
      event: params.event,
    });

    try {
      let response: Response;

      if (this.config.dispatcher) {
        // Invoke via dispatch namespace binding (in-worker, lowest latency)
        const workerHandle = this.config.dispatcher.get(
          scriptName,
          {},
          { limits: { cpuMs: params.timeoutMs ?? 5000 } },
        );
        response = await workerHandle.fetch(
          new Request("https://hook.internal/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          }),
        );
      } else if (this.config.dispatchUrl) {
        // Invoke via HTTP (external fallback)
        response = await fetch(`${this.config.dispatchUrl}/${scriptName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiToken}`,
          },
          body,
        });
      } else {
        return {
          success: false,
          error: "No dispatcher binding or dispatchUrl configured",
          durationMs: Date.now() - start,
          apiCalls: [],
        };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Worker invocation failed (${response.status}): ${errorText}`,
          durationMs: Date.now() - start,
          apiCalls: [],
        };
      }

      const result = (await response.json()) as CodeExecutionResult;
      return {
        ...result,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        apiCalls: [],
      };
    }
  }

  /**
   * Deploy user code as a worker to the dispatch namespace.
   * Wraps the code in a worker template and uploads via Cloudflare API.
   */
  async deploy(hookCodeId: string, code: string): Promise<void> {
    const scriptName = `hook-${hookCodeId}`;
    const workerScript = generateWorkerScript(code);

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/workers/dispatch/namespaces/${this.config.dispatchNamespace}/scripts/${scriptName}`;

    const metadata = JSON.stringify({
      main_module: "index.js",
      compatibility_date: "2024-11-20",
    });

    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([metadata], { type: "application/json" }),
    );
    formData.append(
      "index.js",
      new Blob([workerScript], { type: "application/javascript+module" }),
      "index.js",
    );

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to deploy hook worker ${scriptName}: ${response.status} ${errorBody}`,
      );
    }
  }

  /**
   * Remove a user worker from the dispatch namespace.
   */
  async remove(hookCodeId: string): Promise<void> {
    const scriptName = `hook-${hookCodeId}`;

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/workers/dispatch/namespaces/${this.config.dispatchNamespace}/scripts/${scriptName}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
      },
    });

    // 404 is fine — the worker may have already been removed
    if (!response.ok && response.status !== 404) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to remove hook worker ${scriptName}: ${response.status} ${errorBody}`,
      );
    }
  }
}
