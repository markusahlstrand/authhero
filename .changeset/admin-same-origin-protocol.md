---
"@authhero/admin": patch
---

Fix the admin UI calling http://localhost:3000/oauth/token when served from an https auth server. buildUrlWithProtocol now follows the page's own protocol for same-origin domains and defaults other schemeless domains to https instead of forcing http for loopback hosts; an explicit http:// URL is still respected for local servers.
