import { ASSETS } from "./assets.generated.js";

/**
 * Serve the SPA from the worker itself. A pushed sandbox-clean vertical has no
 * ASSETS binding, so the built SPA is inlined into assets.generated.ts and served
 * here — the catch-all behind the API routes. Exact file hits serve; extensionless
 * paths fall back to index.html (client routes); a missing path WITH an extension
 * is a real 404. index.html gets the deployment's public runtime config injected
 * as window.__APP_CONFIG__ so one build serves every deployment.
 */
const decodeBase64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

const withConfig = (
  html: string,
  config: Record<string, unknown> | undefined,
): string =>
  config
    ? html.replace(
        "<head>",
        // <-escape so a value containing '</script>' cannot break out.
        `<head><script>window.__APP_CONFIG__=${JSON.stringify(config).replace(/</g, "\\u003c")}</script>`,
      )
    : html;

export function serveAsset(
  url: URL,
  config?: Record<string, unknown>,
): Response {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const exact = ASSETS[pathname];
  if (exact) {
    const body =
      exact.encoding === "base64"
        ? decodeBase64(exact.body)
        : pathname === "/index.html"
          ? withConfig(exact.body, config)
          : exact.body;
    return new Response(body, { headers: { "content-type": exact.type } });
  }
  const looksLikeFile = /\.[a-z0-9]+$/i.test(pathname);
  const index = ASSETS["/index.html"];
  if (looksLikeFile || !index)
    return new Response("not found", { status: 404 });
  return new Response(withConfig(index.body, config), {
    headers: { "content-type": index.type },
  });
}
