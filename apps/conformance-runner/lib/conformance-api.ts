import { env } from "./env";

export type TestStatus =
  | "CREATED"
  | "CONFIGURED"
  | "RUNNING"
  | "WAITING"
  | "FINISHED"
  | "INTERRUPTED";

export type TestResult =
  | "PASSED"
  | "WARNING"
  | "FAILED"
  | "SKIPPED"
  | "REVIEW";

export interface TestPlanModule {
  testModule: string;
  variant?: Record<string, string>;
}

export interface CreatedPlan {
  id: string;
  name: string;
  modules: TestPlanModule[];
}

export interface CreatedTest {
  id: string;
  name: string;
}

export interface TestInfo {
  id: string;
  status: TestStatus;
  result?: TestResult;
  error?: string;
  browser?: {
    urls: string[];
    visited: string[];
    urlsWithMethod?: { url: string; method: string }[];
  };
}

export interface ConformanceClientOptions {
  baseUrl?: string;
  apiToken?: string;
}

export class ConformanceClient {
  readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: ConformanceClientOptions = {}) {
    const base = options.baseUrl ?? env.conformanceBaseUrl;
    this.baseUrl = base.endsWith("/") ? base.slice(0, -1) : base;
    this.headers = { "Content-Type": "application/json" };
    if (options.apiToken) {
      this.headers["Authorization"] = `Bearer ${options.apiToken}`;
    }
  }

  async listAvailableModules(): Promise<{ testModule: string }[]> {
    return this.request("GET", "/api/runner/available");
  }

  async createPlan(
    planName: string,
    config: Record<string, unknown>,
    variant?: Record<string, string>,
  ): Promise<CreatedPlan> {
    const params = new URLSearchParams({ planName });
    if (variant) params.set("variant", JSON.stringify(variant));
    return this.request(
      "POST",
      `/api/plan?${params}`,
      JSON.stringify(config),
      201,
    );
  }

  async createTestFromPlan(
    planId: string,
    testName: string,
    variant?: Record<string, string>,
  ): Promise<CreatedTest> {
    const params = new URLSearchParams({ test: testName, plan: planId });
    if (variant) params.set("variant", JSON.stringify(variant));
    return this.request("POST", `/api/runner?${params}`, undefined, 201);
  }

  async startTest(testId: string): Promise<unknown> {
    return this.request("POST", `/api/runner/${testId}`);
  }

  async getInfo(testId: string): Promise<TestInfo> {
    return this.request("GET", `/api/info/${testId}`);
  }

  async getBrowserStatus(testId: string): Promise<{
    urls: string[];
    visited: string[];
  }> {
    return this.request("GET", `/api/runner/browser/${testId}`);
  }

  async getTestLog(
    testId: string,
  ): Promise<
    { result?: string; msg?: string; src?: string; upload?: string }[]
  > {
    return this.request("GET", `/api/log/${testId}`);
  }

  /**
   * Fill an "upload screenshot" placeholder created by the suite's
   * `createBrowserInteractionPlaceholder()` (e.g. ExpectSecondLoginPage in
   * oidcc-prompt-login). The suite refuses to advance from WAITING until
   * every placeholder is satisfied. Posting any valid base64-encoded image
   * is enough — the suite only verifies file type/size, not contents.
   */
  async uploadPlaceholderImage(
    testId: string,
    placeholder: string,
    encodedDataUri: string,
  ): Promise<unknown> {
    const url = `${this.baseUrl}/api/log/${testId}/images/${placeholder}`;
    const res = await fetch(url, {
      method: "POST",
      // Note: the suite's controller reads the body as a raw string, not JSON.
      headers: { ...this.headers, "Content-Type": "text/plain" },
      body: encodedDataUri,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `uploadPlaceholderImage(${testId}, ${placeholder}) -> HTTP ${res.status}: ${text}`,
      );
    }
    return res.json();
  }

  async waitForState(
    testId: string,
    desired: TestStatus[],
    timeoutMs = 240_000,
  ): Promise<TestStatus> {
    const deadline = Date.now() + timeoutMs;
    let last: TestStatus | undefined;
    while (Date.now() < deadline) {
      const info = await this.getInfo(testId);
      if (info.status !== last) {
        console.log(`[conformance-runner] ${testId} -> ${info.status}`);
        last = info.status;
      }
      // Order matters: callers can opt INTO accepting INTERRUPTED by passing
      // it in `desired` (the spec does this so it can read the suite's first
      // FAILURE log entry and surface it via a clean expect() message rather
      // than crashing with a generic Error here).
      if (desired.includes(info.status)) return info.status;
      if (info.status === "INTERRUPTED") {
        throw new Error(
          `Test ${testId} moved to INTERRUPTED: ${info.error ?? "no detail"}`,
        );
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
      `Timed out waiting for test ${testId} to reach one of ${desired.join(", ")}`,
    );
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: string,
    expectStatus = 200,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    // Bounded per-request timeout so a hung suite doesn't freeze waitForState's
    // poll loop until Playwright's outer test timeout fires. Most calls return
    // in well under a second, but module-creation (POST /api/runner) can take
    // 15–25s the first time the suite spins up a new module class — hence 30s.
    const timeoutMs = 30_000;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: this.headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(
          `Conformance API ${method} ${path} -> timed out after ${timeoutMs}ms`,
        );
      }
      throw err;
    }
    if (res.status !== expectStatus) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Conformance API ${method} ${path} -> HTTP ${res.status}: ${text}`,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
