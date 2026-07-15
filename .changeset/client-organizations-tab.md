---
"@authhero/admin": minor
---

Add an Organizations tab to the client (application) edit screen exposing `organization_usage` (Deny/Allow/Require) and `organization_require_behavior` (No prompt/Pre-login/Post-login). These were previously only editable via raw JSON, but are required to enable org-scoped token exchange (a `Deny` client is rejected with `unauthorized_client`).
