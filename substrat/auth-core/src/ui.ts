// UI handlers over the inlined asset maps — the worker-bundle analogue of the
// docker entrypoint's serveStatic setup: the admin SPA at /admin (with the same
// <base> + window.__AUTHHERO_ADMIN_CONFIG__ injection docker performs) and the
// login widget at /u/widget. Runtime-agnostic (plain Response/handler code).
import type { Context, Next } from "hono";
import {
  ADMIN_ASSETS,
  WIDGET_ASSETS,
  type BundledAsset,
} from "./assets.generated.js";

const decodeBase64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

function respond(asset: BundledAsset): Response {
  const body =
    asset.encoding === "base64" ? decodeBase64(asset.body) : asset.body;
  return new Response(body, { headers: { "content-type": asset.type } });
}

/** serveStatic-alike over an asset map: exact hit serves, otherwise next(). */
function assetHandler(
  assets: Record<string, BundledAsset>,
  stripPrefix: string,
) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const path = c.req.path.startsWith(stripPrefix)
      ? c.req.path.slice(stripPrefix.length) || "/index.html"
      : c.req.path;
    const asset = assets[path];
    if (asset) return respond(asset);
    await next();
  };
}

export const widgetHandler = assetHandler(WIDGET_ASSETS, "/u/widget");
export const adminHandler = assetHandler(ADMIN_ASSETS, "/admin");

/**
 * The admin SPA shell with the deployment's config injected — docker's exact
 * transformation (base href so relative assets resolve under /admin/ on client
 * routes; __AUTHHERO_ADMIN_CONFIG__ so the SPA logs in against THIS tenant's
 * issuer with the seeded client).
 */
export function adminIndexFor(
  issuer: string,
  clientId: string,
): string | undefined {
  const raw = ADMIN_ASSETS["/index.html"];
  if (!raw) return undefined;
  const config = {
    domain: issuer.replace(/\/$/, ""),
    clientId,
    basePath: "/admin",
  };
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return raw.body
    .replace(/<base\s[^>]*\/?>(\n)?/g, "") // drop any build-time <base> — ours must win
    .replace(
      /<head(\s[^>]*)?>/,
      (match) => `${match}\n    <base href="/admin/" />`,
    )
    .replace(
      "</head>",
      `<script>window.__AUTHHERO_ADMIN_CONFIG__=${json};</script>\n</head>`,
    );
}
