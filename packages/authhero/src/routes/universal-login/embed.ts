/**
 * Embedded login: the hosted /u2 pages rendered inside an <iframe> on the
 * application's own site (typically in a modal) instead of a full redirect.
 *
 * A login session is "embedded" when it was started with
 * `response_mode=web_message`: the authorization response is then delivered
 * with `postMessage` to the window that owns the iframe, which only makes
 * sense when the pages are framed. Nothing else is needed to opt in — the
 * application lists its origin in the client's `web_origins` (Auth0's
 * "Allowed Web Origins", already the allowlist for the web_message mode)
 * and the pages become frameable from exactly those origins.
 *
 * Credentials never leave the auth origin: the widget runs inside the frame,
 * so scripts on the embedding page cannot read what the user types. The
 * frame and its parent only exchange the messages documented on
 * `buildEmbedPageScript`.
 */

import type { LoginSession } from "@authhero/adapter-interfaces";
import type { MiddlewareHandler } from "hono";
import type { Bindings, Variables } from "../../types";

export type EmbedLoginContext = {
  /**
   * Origin of the application page that owns the iframe: the origin of the
   * login session's `redirect_uri`. The same target the web_message response
   * itself is posted to, so a page that can receive the tokens can receive
   * the resize messages and nothing else can.
   */
  targetOrigin: string;
  /**
   * Origins allowed to frame the pages, from the client's `web_origins`.
   * Empty means nobody may: the pages render with `frame-ancestors 'none'`
   * until the application's origin is added to the client.
   */
  frameAncestors: string[];
};

function toOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Decide whether the current login session is embedded and, if so, which
 * origins take part. Returns `undefined` for every ordinary redirect flow.
 */
export function resolveEmbedLogin(
  loginSession: Pick<LoginSession, "authParams">,
  client: { web_origins?: string[] },
): EmbedLoginContext | undefined {
  if (loginSession.authParams.response_mode !== "web_message") {
    return undefined;
  }
  const targetOrigin = toOrigin(loginSession.authParams.redirect_uri);
  if (!targetOrigin) {
    return undefined;
  }
  const frameAncestors = Array.from(
    new Set(
      (client.web_origins ?? [])
        .map((origin) => toOrigin(origin))
        .filter((origin): origin is string => Boolean(origin)),
    ),
  );
  return { targetOrigin, frameAncestors };
}

/**
 * The `Content-Security-Policy` value for a universal-login response. Every
 * page denies framing unless the login session is embedded, in which case
 * only the client's web origins may frame it. The legacy `X-Frame-Options`
 * header cannot express an allowlist, so it is only set alongside the deny.
 */
export function frameAncestorsHeaders(
  embed: EmbedLoginContext | undefined,
): Record<string, string> {
  if (embed && embed.frameAncestors.length > 0) {
    return {
      "Content-Security-Policy": `frame-ancestors ${embed.frameAncestors.join(" ")}`,
    };
  }
  return {
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
  };
}

/**
 * Inline script for an embedded widget page. It is the only code that talks
 * across the frame boundary, in three directions:
 *
 * 1. Resize: posts `{ type: "authhero:resize", height }` to the embedding
 *    page whenever the document's height changes, so the parent can size
 *    the iframe to the current screen instead of fixing its height.
 * 2. Social and enterprise connections: those providers refuse to render
 *    inside a frame, so the widget's redirect to the provider is intercepted
 *    and opened in a popup window instead. Two shapes reach us: social
 *    login redirects to our own /authorize, which 302s onwards to the
 *    provider, while an enterprise connection matched by the identifier
 *    form's home-realm discovery redirects straight to the IdP on its own
 *    origin. So the popup opens for our /authorize and for anything that
 *    leaves our origin. Every other same-origin URL — /authorize/resume
 *    after a password or MFA step, the next /u2 screen — is an internal
 *    hop that belongs inside the frame and is left alone.
 *
 *    The popup completes on the web_message response page, which posts the
 *    authorization response to its opener (this frame) on our own origin.
 *    A popup opened from the HRD path follows an awaited fetch rather than
 *    a click, so a blocker may refuse it; the frame then navigates as it
 *    did before, which is the pre-existing dead-frame case, not a new one.
 * 3. Relay: an authorization response received from such a popup is
 *    forwarded to the embedding page, so the parent sees every completion
 *    as coming from the iframe, whichever path produced it.
 *
 * Every outbound message targets the login session's redirect_uri origin;
 * the inbound relay only accepts messages from our own origin.
 */
export function buildEmbedPageScript(embed: EmbedLoginContext): string {
  const target = JSON.stringify(embed.targetOrigin);
  return `(function(){
var target=${target};
var top=window.parent;
if(!top||top===window)return;
function post(msg){try{top.postMessage(msg,target)}catch(e){}}
var last=-1;
function report(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h!==last){last=h;post({type:"authhero:resize",height:h})}}
if(window.ResizeObserver){new ResizeObserver(report).observe(document.documentElement)}
window.addEventListener("load",report);
report();
window.addEventListener("message",function(evt){
if(evt.origin!==window.location.origin)return;
var d=evt.data;
if(!d||d.type!=="authorization_response")return;
try{if(evt.source&&evt.source!==window&&typeof evt.source.close==="function")evt.source.close()}catch(e){}
post(d);
});
function attach(widget){
widget.addEventListener("navigate",function(evt){
var url=evt.detail&&evt.detail.url;if(!url)return;
var u;try{u=new URL(url,window.location.origin)}catch(e){return}
if(u.origin===window.location.origin&&u.pathname!=="/authorize")return;
var w=window.open(u.toString(),"authhero_login","popup,width=500,height=650");
if(w){evt.preventDefault()}
});
}
var widget=document.querySelector("authhero-widget");
if(widget){attach(widget)}
})()`;
}

/**
 * Inline script for an embedded error page: delivers the error to the
 * embedding page as a web_message authorization response, the same shape
 * the application already handles for `/authorize` errors, so a modal can
 * close or show its own message instead of leaving the frame stuck.
 */
export function buildEmbedErrorScript(
  embed: EmbedLoginContext,
  error: { error: string; error_description: string; state?: string },
): string {
  const target = JSON.stringify(embed.targetOrigin);
  // "<" is escaped so no error text can close the inline script tag.
  const response = JSON.stringify({
    type: "authorization_response",
    response: error,
  }).replace(/</g, "\\u003c");
  return `(function(){
var top=window.parent;
if(!top||top===window)return;
try{top.postMessage(${response},${target})}catch(e){}
})()`;
}

/**
 * Sets the frame-ancestors policy on every universal-login response. Runs
 * after the handler so it can read the `embedLogin` context variable that
 * `initJSXRoute` resolved for the login session. Handlers that build their
 * own response (the error handler) call `frameAncestorsHeaders` directly,
 * since an exception bypasses the post-`next()` part of a middleware.
 */
export const frameAncestorsMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (ctx, next) => {
  await next();
  const headers = frameAncestorsHeaders(ctx.var.embedLogin);
  for (const [name, value] of Object.entries(headers)) {
    ctx.header(name, value);
  }
};
