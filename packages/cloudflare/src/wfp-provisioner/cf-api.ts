/**
 * Thin Cloudflare REST API client for the WFP+D1 provisioner.
 *
 * Each method maps 1:1 to a documented CF endpoint and returns the parsed
 * response body. Errors surface as `CloudflareApiError` carrying the HTTP
 * status, endpoint, and (when JSON) the CF error array — making them easy
 * to log without re-fetching the response.
 *
 * Idempotency is the caller's responsibility — the provisioner sequences
 * calls and tolerates "already exists" / "not found" depending on the
 * operation (see `provisioner.ts`).
 */

export class CloudflareApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly errors: unknown[];
  readonly body: string;

  constructor(
    status: number,
    endpoint: string,
    body: string,
    errors: unknown[] = [],
  ) {
    super(
      `Cloudflare API ${status} ${endpoint}: ${truncate(body, 256)}`,
    );
    this.name = "CloudflareApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
    this.errors = errors;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export interface CfApiClientOptions {
  accountId: string;
  apiToken: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface D1Database {
  uuid: string;
  name: string;
}

export interface D1QueryResult {
  success: boolean;
  meta?: Record<string, unknown>;
  results?: unknown[];
}

export interface ScriptBinding {
  type: "d1" | "plain_text" | "secret_text";
  name: string;
  // d1
  id?: string;
  // plain_text / secret_text
  text?: string;
}

export interface ScriptUploadOptions {
  /** Script source (JavaScript ES module). */
  script: string;
  /** Main module filename (must match part name in form data). */
  mainModule: string;
  /** Compatibility date, ISO yyyy-mm-dd. */
  compatibilityDate: string;
  /** Compatibility flags (e.g. `["nodejs_compat"]`). */
  compatibilityFlags?: string[];
  /** Bindings to attach (D1, plain_text, etc.). Secrets go via setSecret(). */
  bindings?: ScriptBinding[];
  /** Optional tags, stored on the script for operator-side lookup. */
  tags?: string[];
}

export class CloudflareApiClient {
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: CfApiClientOptions) {
    this.accountId = options.accountId;
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.baseUrl = (options.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(
      /\/+$/,
      "",
    );
  }

  // ─── D1 ───────────────────────────────────────────────────────────────

  async createD1Database(name: string): Promise<D1Database> {
    const path = `/accounts/${encodeURIComponent(this.accountId)}/d1/database`;
    const res = await this.request<{ result: D1Database }>("POST", path, {
      body: JSON.stringify({ name }),
    });
    return res.result;
  }

  async listD1Databases(name?: string): Promise<D1Database[]> {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    const path = `/accounts/${encodeURIComponent(this.accountId)}/d1/database${qs}`;
    const res = await this.request<{ result: D1Database[] }>("GET", path);
    return res.result ?? [];
  }

  async deleteD1Database(databaseId: string): Promise<void> {
    const path = `/accounts/${encodeURIComponent(this.accountId)}/d1/database/${encodeURIComponent(databaseId)}`;
    await this.request("DELETE", path);
  }

  /**
   * Execute a single SQL statement (or batch of `;`-separated statements
   * permitted by D1) against the given database. Use for applying
   * migrations one file at a time — the per-call response size cap means
   * very large single calls can fail; splitting per file keeps each call
   * bounded by the migration author.
   */
  async execD1(databaseId: string, sql: string): Promise<D1QueryResult[]> {
    const path = `/accounts/${encodeURIComponent(this.accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
    const res = await this.request<{ result: D1QueryResult[] }>("POST", path, {
      body: JSON.stringify({ sql }),
    });
    return res.result ?? [];
  }

  // ─── Dispatch-namespace scripts ────────────────────────────────────────

  async uploadNamespacedScript(
    namespace: string,
    scriptName: string,
    options: ScriptUploadOptions,
  ): Promise<void> {
    const path = `/accounts/${this.accountId}/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(scriptName)}`;

    // Multipart upload: one metadata part + one JS part. CF expects the
    // `body_part` (or `main_module` for modules) field in metadata to point
    // at the JS part's filename.
    const metadata = {
      main_module: options.mainModule,
      compatibility_date: options.compatibilityDate,
      compatibility_flags: options.compatibilityFlags ?? [],
      bindings: options.bindings ?? [],
      tags: options.tags,
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    form.append(
      options.mainModule,
      new Blob([options.script], {
        type: "application/javascript+module",
      }),
      options.mainModule,
    );

    await this.request("PUT", path, { body: form });
  }

  async deleteNamespacedScript(
    namespace: string,
    scriptName: string,
  ): Promise<void> {
    const path = `/accounts/${this.accountId}/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(scriptName)}`;
    // CF returns 404 if the script never existed — surface that to the caller
    // who can ignore it for idempotent deprovision.
    await this.request("DELETE", path);
  }

  // ─── Secrets ──────────────────────────────────────────────────────────

  /**
   * Set a single secret on a namespaced script. The CF API replaces the
   * value if a secret with that name already exists, so this is safely
   * re-runnable.
   */
  async setNamespacedScriptSecret(
    namespace: string,
    scriptName: string,
    secretName: string,
    secretValue: string,
  ): Promise<void> {
    const path = `/accounts/${this.accountId}/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(scriptName)}/secrets`;
    await this.request("PUT", path, {
      body: JSON.stringify({
        name: secretName,
        text: secretValue,
        type: "secret_text",
      }),
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private async request<T = unknown>(
    method: string,
    path: string,
    init?: { body?: BodyInit; headers?: Record<string, string> },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      ...(init?.headers ?? {}),
    };
    // Default JSON content-type unless the body is FormData (browser sets the
    // boundary header) or there's no body.
    if (init?.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: init?.body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    if (!res.ok) {
      let errors: unknown[] = [];
      try {
        const parsed = JSON.parse(text) as { errors?: unknown[] };
        if (Array.isArray(parsed.errors)) errors = parsed.errors;
      } catch {
        // non-JSON error body — leave errors empty
      }
      throw new CloudflareApiError(res.status, path, text, errors);
    }
    if (text === "" || res.status === 204) return undefined as T;
    return JSON.parse(text) as T;
  }
}
