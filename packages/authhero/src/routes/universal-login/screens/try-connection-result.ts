/**
 * Try-Connection Result screen — diagnostic page that renders the outcome
 * of a connection test (initiated via `POST /api/v2/connections/{id}/try`).
 *
 * Corresponds to: /u2/try-connection-result
 *
 * The result is read from `loginSession.state_data` — the connection
 * callback writes it there before redirecting here.
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { readTryConnectionResult } from "../../../authentication-flows/try-connection";

function renderJsonBlock(label: string, value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  return `
    <div style="margin-top:16px">
      <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">${escapeHtml(label)}</div>
      <pre style="margin:0;padding:12px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow:auto;max-height:360px"><code>${escapeHtml(json)}</code></pre>
    </div>
  `;
}

export async function tryConnectionResultScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { ctx, tenant, branding, state } = context;

  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  const result = loginSession ? readTryConnectionResult(loginSession) : null;

  const summaryBlock = (() => {
    if (!result) {
      return `
        <div style="padding:16px;border:1px solid #fcd34d;border-radius:8px;background:#fef3c7;color:#92400e">
          <div style="font-weight:600;margin-bottom:4px">No result available</div>
          <div style="font-size:13px">This page expects a state from a /api/v2/connections/{id}/try request.</div>
        </div>
      `;
    }
    if (result.status === "success") {
      return `
        <div style="padding:16px;border:1px solid #6ee7b7;border-radius:8px;background:#ecfdf5;color:#065f46">
          <div style="font-weight:600;margin-bottom:4px">It works!</div>
          <div style="font-size:13px">Connection <strong>${escapeHtml(result.connection_name)}</strong> (${escapeHtml(result.strategy)}) returned a profile.</div>
        </div>
        ${renderJsonBlock("Normalized profile", result.userinfo)}
        ${renderJsonBlock("Raw provider response", result.raw ?? "(strategy does not expose raw upstream payload yet)")}
      `;
    }
    return `
      <div style="padding:16px;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#991b1b">
        <div style="font-weight:600;margin-bottom:4px">Try connection failed</div>
        <div style="font-size:13px">${escapeHtml(result.error)}${result.error_description ? `: ${escapeHtml(result.error_description)}` : ""}</div>
      </div>
      ${renderJsonBlock("Error", result)}
    `;
  })();

  // Only post the result back to the opener if we have a validated origin
  // for it — broadcasting with '*' would leak the profile/raw payload to any
  // page that managed to become window.opener.
  const openerOriginRaw = ctx.req.query("opener_origin");
  let trustedOpenerOrigin = "";
  if (openerOriginRaw) {
    try {
      const parsed = new URL(openerOriginRaw);
      if (parsed.origin === openerOriginRaw) {
        trustedOpenerOrigin = parsed.origin;
      }
    } catch {
      // ignore invalid opener_origin
    }
  }

  const postMessageScript =
    result && trustedOpenerOrigin
      ? `<script>try{window.opener&&window.opener.postMessage({type:'authhero:try-connection',result:${JSON.stringify(result).replace(/</g, "\\u003c")}},${JSON.stringify(trustedOpenerOrigin)})}catch(_){}</script>`
      : "";

  const components: FormNodeComponent[] = [
    {
      id: "try-connection-result",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div style="display:flex;flex-direction:column;gap:12px">${summaryBlock}${postMessageScript}</div>`,
      },
      order: 0,
    },
  ];

  const screen: UiScreen = {
    name: "try-connection-result",
    action: "",
    method: "POST",
    title: "Try Connection",
    description:
      result?.status === "success"
        ? "The connection completed successfully."
        : result?.status === "error"
          ? "The connection returned an error."
          : "No result available.",
    components,
  };

  return { screen, branding };
}

export const tryConnectionResultScreenDefinition: ScreenDefinition = {
  id: "try-connection-result",
  name: "Try Connection Result",
  description: "Diagnostic result page for connection tests",
  handler: {
    get: tryConnectionResultScreen,
  },
};
