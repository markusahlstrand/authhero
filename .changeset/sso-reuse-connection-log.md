---
"authhero": patch
---

Fix SSO session reuse recording the primary identity's connection instead of the connection actually used. When an existing session is reused for a new client at `/authorize`, the connection is now recovered from the originating login session's `auth_connection`/`auth_strategy`. Both the `SUCCESS_LOGIN` audit log and the `onExecutePostLogin` hook event's `connection` now report the connection the user actually authenticated with (resolved via `auth_connection`), rather than falling back to the primary database identity. This matters for users who authenticated via a linked secondary identity (e.g. an OIDC connection).
