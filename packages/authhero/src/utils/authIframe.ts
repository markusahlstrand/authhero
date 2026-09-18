import { Context } from "hono";
import { Bindings, Variables } from "../types";

/**
 * Renders an iframe response for authentication flows.
 * The Server-Timing header prevents Cloudflare from adding the beacon script
 * which might interfere with Safari ITP.
 */
export default function renderAuthIframe(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  targetOrigin: string,
  response: string,
  additionalHeaders?: Headers,
) {
  const headers = new Headers(additionalHeaders);
  headers.set("Server-Timing", "cf-nel=0; no-cloudflare-insights=1");

  const auth0Iframe = `<!DOCTYPE html>
  <html>
  
  <head>
      <title>Authorization Response</title>
  </head>
  
  <body>
      <script type="text/javascript">
          (function (window, document) {
              var targetOrigin = "${targetOrigin}";
              var webMessageRequest = {};
              var authorizationResponse = {
                  type: "authorization_response",
                  response: ${response}
              };
  
          var mainWin = (window.opener) ? window.opener : window.parent;
          if (webMessageRequest["web_message_uri"] && webMessageRequest["web_message_target"]) {
              window.addEventListener("message", function (evt) {
                  if (evt.origin != targetOrigin)
                      return;
                  switch (evt.data.type) {
                      case "relay_response":
                          var messageTargetWindow = evt.source.frames[webMessageRequest["web_message_target"]];
                          if (messageTargetWindow) {
                              messageTargetWindow.postMessage(authorizationResponse, webMessageRequest["web_message_uri"]);
                              window.close();
                          }
                          break;
                  }
              });
              mainWin.postMessage({
                  type: "relay_request"
              }, targetOrigin);
          } else {
              mainWin.postMessage(authorizationResponse, targetOrigin);
              // Embedded login: a social/enterprise connection is opened
              // as a popup by the login iframe, so the opener is on our own
              // origin rather than the application's and the post above is
              // dropped by the browser. Post to our origin as well so the
              // iframe can relay the response to the application (embed.ts);
              // a same-origin target can only ever reach our own pages.
              if (window.opener && window.location.origin !== targetOrigin) {
                  mainWin.postMessage(authorizationResponse, window.location.origin);
              }
          }
          }
          ) (this, this.document);
      </script>
  </body>
  
  </html>`;

  return ctx.html(auth0Iframe, { headers });
}
