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
 * client and render it. The tab is opened synchronously on the user gesture to
 * avoid popup blockers, then populated once the HTML arrives.
 *
 * The (tenant-controlled) template HTML is rendered inside a sandboxed iframe
 * without `allow-same-origin`, so it executes in an opaque origin and cannot
 * reach the admin origin's storage, cookies, or APIs.
 */
export async function openFullPreview({
  tenantId,
  screen,
  body,
  branding,
  theme,
}: OpenFullPreviewOptions): Promise<void> {
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error(
      "Could not open the preview tab. Your browser blocked the popup — please allow popups for this site and try again.",
    );
  }
  win.document.write(
    "<!doctype html><title>Loading preview…</title><body style='font-family:system-ui;padding:24px;color:#555'>Loading preview…</body>",
  );

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

    // Replace the loading shell with a sandboxed iframe holding the template.
    // `srcdoc` is set via the property (no escaping needed) and the sandbox
    // omits `allow-same-origin`, isolating the template in an opaque origin.
    win.document.open();
    win.document.write(
      "<!doctype html><html><head><meta charset='utf-8'><title>Universal Login preview</title>" +
        "<style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100vh}</style>" +
        "</head><body></body></html>",
    );
    win.document.close();
    const iframe = win.document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
    iframe.srcdoc = html;
    win.document.body.appendChild(iframe);
  } catch (err) {
    win.document.body.innerHTML =
      "<p style='font-family:system-ui;padding:24px;color:#b91c1c'>Failed to load preview.</p>";
    throw err;
  }
}
