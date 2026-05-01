import type { Page } from "@playwright/test";
import type { ConformanceClient, TestStatus } from "./conformance-api";
import { env } from "./env";

const TERMINAL_STATES: TestStatus[] = ["FINISHED", "INTERRUPTED"];

// Minimal 1x1 transparent PNG. The suite only validates file type/size
// (data:image/png;base64, ≤500KB), not contents — see
// ImageAPI.validateEncodedImageFile in the conformance suite source.
const PLACEHOLDER_PNG =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

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
  pollIntervalMs = 500,
  // The suite's screenshot-placeholder poller backs off exponentially up to
  // 30s, so we need ≥30s after filling for it to fire FINISHED. Most modules
  // complete in <5s; this only matters when WAITING-with-placeholders.
  timeoutMs = 35_000,
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
      await page.goto(url, { waitUntil: "load", timeout: 5_000 });
      await fillAuthHeroLoginIfPresent(page, username, password);
      // Once Playwright lands on the suite's callback page, the suite picks up
      // the result asynchronously — polling resumes below.
    }

    // Some modules (e.g. oidcc-prompt-login, oidcc-max-age-1) sit in WAITING
    // after the browser flow until "screenshot upload" placeholders are
    // satisfied. Auto-fill them with a 1x1 PNG since we run unattended.
    if (
      info.status === "WAITING" &&
      pendingUrls.length === 0 &&
      browser.urls.length > 0
    ) {
      await fillScreenshotPlaceholders(client, testId);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  // One last status read so the timeout message can distinguish "suite is
  // genuinely stuck in WAITING" from "we cut off right as it FINISHED".
  const finalInfo = await client.getInfo(testId).catch(() => undefined);
  const finalBrowser = await client
    .getBrowserStatus(testId)
    .catch(() => undefined);
  throw new Error(
    `Timed out after ${timeoutMs}ms running browser flow for test ${testId}. ` +
      `Suite status=${finalInfo?.status ?? "?"} result=${finalInfo?.result ?? "(none)"}. ` +
      `Page URL: ${page.url()}. Visited ${visited.size}/${finalBrowser?.urls.length ?? "?"} URL(s).`,
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
    const submitButton = page.locator('button[type="submit"]');

    const hasUsername = (await usernameField.count()) > 0;
    const hasPassword = (await passwordField.count()) > 0;
    const hasSubmit = (await submitButton.count()) > 0;

    // Bail if there's nothing to interact with at all.
    if (!hasUsername && !hasPassword && !hasSubmit) return;

    if (hasUsername) {
      const field = usernameField.first();
      const isDisabled = await field.isDisabled().catch(() => false);
      if (!isDisabled) await field.fill(username);
    }
    if (hasPassword) {
      await passwordField.first().fill(password);
    }

    // Submit advances all UL screens — identifier, password, and also
    // interstitials with no fields like /u2/check-account ("Yes, continue").
    await Promise.all([
      page.waitForURL((u) => u.href !== startUrl, { timeout: 5_000 }),
      submitButton.first().click(),
    ]);
  }

  // If we exhausted the loop and the page is *still* on a u/u2 path, the
  // login flow is stuck (e.g. validation error we don't recognise, infinite
  // redirect, or a screen with no submittable form). Surface this loudly
  // instead of returning silently and letting the outer poll time out with
  // a generic "Timed out" message.
  if (isAuthHeroLoginUrl(page.url())) {
    throw new Error(
      `AuthHero universal-login still active after 4 submission attempts (current URL: ${page.url()})`,
    );
  }
}

// Track placeholders we've already filled so repeated polls don't blow past
// the suite's 2-uploads-per-test cap.
const filledPlaceholders = new Set<string>();

async function fillScreenshotPlaceholders(
  client: ConformanceClient,
  testId: string,
): Promise<void> {
  const log = await client.getTestLog(testId).catch(() => []);
  const placeholders = log
    .map((entry) => entry.upload)
    .filter((p): p is string => typeof p === "string");

  for (const placeholder of placeholders) {
    const key = `${testId}:${placeholder}`;
    if (filledPlaceholders.has(key)) continue;
    console.log(
      `[conformance-runner] filling screenshot placeholder ${placeholder} for ${testId}`,
    );
    try {
      await client.uploadPlaceholderImage(
        testId,
        placeholder,
        PLACEHOLDER_PNG,
      );
      filledPlaceholders.add(key);
    } catch (err) {
      console.warn(
        `[conformance-runner] placeholder upload failed: ${err instanceof Error ? err.message : err}`,
      );
    }
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
