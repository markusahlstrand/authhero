---
"authhero": patch
---

Fix the always-allowed auth-server self-callbacks in /authorize and /account. The issuer and universal-login wildcard entries were built by appending "/\*" to bases that already end in "/", producing patterns like `https://domain//*` whose path regex never matches a real pathname — so redirect URIs pointing back at the auth server itself (e.g. the /u2/info test screen on a custom domain or tenant subdomain) were rejected with "Invalid redirect URI". Also stop mutating client.callbacks when appending the wildcards.
