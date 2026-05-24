---
"authhero": patch
---

Improve invitation/ticket flow robustness:

- Build organization invitation URLs via `URL` + `searchParams` so invite/organization ids are encoded correctly.
- Capture and log failure reasons in the `accept-invitation` screen's user-creation and post-accept auto-login paths instead of silently swallowing them, and show an explicit error to the user when the auto-login step fails.
- Log meaningful failure details (ticket, user, client, redirect) in the `/u2/tickets/password-change` handler before throwing on invalid/expired/consumed tickets or missing user/client/callback.
