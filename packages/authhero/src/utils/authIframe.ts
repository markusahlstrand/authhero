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
          }
          }
          ) (this, this.document);
      </script>
  </body>
  
  </html>`;

  return ctx.html(auth0Iframe, { headers });
}
