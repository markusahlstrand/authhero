---
"authhero": patch
---

Fix DCR connect consent rejecting users who legitimately reached the consent screen.

On a multi-tenancy control plane, the workspace picker grants access via the global `admin:organizations` escape hatch (and per-org `create:clients`), but the consent POST re-validated with a plain org-membership check that honored neither. A global admin (or anyone who picked a workspace they don't directly belong to) could pass the picker and then get a bare `400` on consent. Both screens now share a single `userCanRegisterOnTenant` authorization helper so they can't drift.

Also surface screen handler error messages to the widget instead of silently re-rendering the same screen — failed submissions now show the reason (e.g. "You don't have access to that workspace") on both the JSON and HTML render paths. The no-JS HTML fallback now returns `400` (matching the JSON widget path) when re-rendering a screen after a failed submission, instead of `200`.
