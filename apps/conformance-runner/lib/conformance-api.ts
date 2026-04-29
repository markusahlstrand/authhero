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
  ): Promise<{ result?: string; msg?: string; src?: string }[]> {
    return this.request("GET", `/api/log/${testId}`);
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
    // poll loop until Playwright's outer test timeout fires. 15s is generous —
    // suite calls normally return in well under a second.
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: this.headers,
        body,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(
          `Conformance API ${method} ${path} -> timed out after 15s`,
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
