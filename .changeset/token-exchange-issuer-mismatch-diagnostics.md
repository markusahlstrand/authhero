---
"authhero": patch
---

Report both issuers on a token-exchange `Subject token issuer mismatch`, and name the unresolved host when the expected issuer fell back to `env.ISSUER`. When a request's host resolves no tenant, `custom_domain` is never set and the expected issuer silently becomes the bare `ISSUER` host, so a token minted by a subdomain-addressed tenant could never match — and the error blamed the token, which was the one thing that was correct. The comparison itself is unchanged and stays byte-exact (Auth0 behaves the same); only the diagnostics improve. The issuer values are public discovery data, not secrets.
