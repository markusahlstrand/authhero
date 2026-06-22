import {
  authorizedHttpClient,
  createOrganizationHttpClient,
  isSingleTenantForDomain,
} from "@/authProvider";
import {
  buildUrlWithProtocol,
  formatDomain,
  getDomainFromStorage,
  getSelectedDomainFromStorage,
} from "@/utils/domainUtils";
import { getConfigValue } from "@/utils/runtimeConfig";

/** Resolve the REST API base URL for the currently selected domain. */
export function getApiUrl(): string {
  const domains = getDomainFromStorage();
  const selectedDomain = getSelectedDomainFromStorage();
  const formattedSelectedDomain = formatDomain(selectedDomain);
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === formattedSelectedDomain,
  );

  let apiUrl: string;
  if (domainConfig?.restApiUrl) {
    apiUrl = buildUrlWithProtocol(domainConfig.restApiUrl);
  } else if (selectedDomain) {
    apiUrl = buildUrlWithProtocol(selectedDomain);
  } else {
    apiUrl = buildUrlWithProtocol(getConfigValue("apiUrl"));
  }

  return apiUrl.replace(/\/$/, "");
}

/** Pick the right authorized HTTP client for the selected domain/tenant. */
export function getHttpClient(tenantId: string) {
  const formattedDomain = formatDomain(getSelectedDomainFromStorage());
  if (isSingleTenantForDomain(formattedDomain)) {
    return authorizedHttpClient;
  }
  return createOrganizationHttpClient(tenantId);
}

interface OpenFullPreviewOptions {
  tenantId: string;
  /** Sample screen to render (login | identifier | password | signup). */
  screen?: string;
  /** Unsaved template body to preview. Omit to use the stored/default template. */
  body?: string;
  /** Live branding overrides so the preview reflects unsaved form edits. */
  branding?: unknown;
  /** Live theme overrides so the preview reflects unsaved form edits. */
  theme?: unknown;
}

/**
 * Open the full-page Universal Login preview in a new browser tab.
 *
 * The preview endpoint requires a Bearer token, so we can't simply point a
 * tab at the URL — instead we fetch the rendered HTML with the authorized
 * client and load it into the tab via a blob URL. The tab is opened
 * synchronously on the user gesture to avoid popup blockers, then navigated
 * once the HTML arrives.
 */
export async function openFullPreview({
  tenantId,
  screen,
  body,
  branding,
  theme,
}: OpenFullPreviewOptions): Promise<void> {
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(
      "<!doctype html><title>Loading preview…</title><body style='font-family:system-ui;padding:24px;color:#555'>Loading preview…</body>",
    );
  }

  try {
    const apiUrl = getApiUrl();
    const httpClient = getHttpClient(tenantId);
    const response = await httpClient(
      `${apiUrl}/api/v2/branding/templates/universal-login/preview`,
      {
        method: "POST",
        headers: new Headers({
          "tenant-id": tenantId,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ screen, body, branding, theme }),
      },
    );

    const html =
      response && typeof response === "object" && "body" in response
        ? (response as { body?: string }).body
        : undefined;
    if (typeof html !== "string" || html.length === 0) {
      throw new Error("Empty preview response");
    }

    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    if (win) {
      win.location.href = url;
    } else {
      window.open(url, "_blank");
    }
    // Give the tab time to load before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (win) {
      win.document.body.innerHTML =
        "<p style='font-family:system-ui;padding:24px;color:#b91c1c'>Failed to load preview.</p>";
    }
    throw err;
  }
}
