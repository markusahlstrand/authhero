---
"@authhero/admin": patch
---

Resolve the client "Login" link's custom domain on click instead of from the eagerly-listed custom domains. The list endpoint returns the stored (often stale "pending") status, so the link always fell back to the token domain; fetching the domain on click triggers the Cloudflare-backed status sync and uses the custom domain when it is actually "ready".
