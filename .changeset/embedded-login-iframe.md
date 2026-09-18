---
"authhero": minor
---

Embedded login: the hosted `/u2` pages can run inside an `<iframe>` on the application's own site. A login session started with `response_mode=web_message` renders in a compact layout (no page chrome, transparent background, floating card), posts `authhero:resize` messages so the embedding page can size the frame to each screen, opens social and enterprise connections in a popup and relays their result, and delivers errors as `authorization_response` messages. Framing is allowed only from the client's `web_origins`.

All other universal-login responses (`/u` and `/u2`) now send `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`. Anything that framed the login pages before must list its origin in the application's Allowed Web Origins and use `response_mode=web_message`.
