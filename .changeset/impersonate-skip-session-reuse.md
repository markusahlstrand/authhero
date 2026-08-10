---
"authhero": patch
---

Skip page hooks (e.g. the impersonation page) on SSO session reuse. Pages now only interrupt fresh interactive logins; silently re-authorizing with an existing session completes straight to the callback.
