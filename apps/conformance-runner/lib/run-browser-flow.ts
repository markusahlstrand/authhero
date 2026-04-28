import type { Page } from "@playwright/test";
import type { ConformanceClient, TestStatus } from "./conformance-api";
import { env } from "./env";

const TERMINAL_STATES: TestStatus[] = ["FINISHED", "INTERRUPTED"];

export interface RunBrowserFlowOptions {
  testId: string;
  page: Page;
  client: ConformanceClient;
  username?: string;
  password?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export async function runBrowserFlow({
  testId,
  page,
  client,
  username = env.username,
  password = env.password,
  pollIntervalMs = 1000,
  timeoutMs = 240_000,
}: RunBrowserFlowOptions): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const visited = new Set<string>();

  let lastLogged = "";
  while (Date.now() < deadline) {
    const info = await client.getInfo(testId);

    if (TERMINAL_STATES.includes(info.status)) return;

    const browser = await client.getBrowserStatus(testId);
    const summary = `status=${info.status} pending=${browser.urls.length} visited=${browser.visited.length}`;
    if (summary !== lastLogged) {
      console.log(`[conformance-runner] ${testId} ${summary}`);
      lastLogged = summary;
    }
    const pendingUrls = browser.urls.filter((u) => !visited.has(u));

    for (const url of pendingUrls) {
      visited.add(url);
      console.log(`[conformance-runner] visiting ${url}`);
      await page.goto(url, { waitUntil: "load" });
      await fillAuthHeroLoginIfPresent(page, username, password);
      // Once Playwright lands on the suite's callback page, the suite picks up
      // the result asynchronously — polling resumes below.
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms running browser flow for test ${testId}`,
  );
}

async function fillAuthHeroLoginIfPresent(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  // The universal-login flow may present a single form with both fields,
  // or split it across two screens (identifier → password). We loop until
  // we leave the authhero universal-login URL space.
  for (let i = 0; i < 4; i++) {
    const startUrl = page.url();
    if (!isAuthHeroLoginUrl(startUrl)) return;

    const usernameField = page.locator(
      'input[name="username"]:not([type="hidden"])',
    );
    const passwordField = page.locator('input[name="password"]');

    const hasUsername = (await usernameField.count()) > 0;
    const hasPassword = (await passwordField.count()) > 0;

    if (!hasUsername && !hasPassword) return;

    if (hasUsername) {
      const field = usernameField.first();
      const isDisabled = await field.isDisabled().catch(() => false);
      if (!isDisabled) await field.fill(username);
    }
    if (hasPassword) {
      await passwordField.first().fill(password);
    }

    await Promise.all([
      page.waitForURL((u) => u.href !== startUrl, { timeout: 30_000 }),
      page.locator('button[type="submit"]').first().click(),
    ]);
  }
}

function isAuthHeroLoginUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /^\/u2?\//.test(u.pathname);
  } catch {
    return false;
  }
}
