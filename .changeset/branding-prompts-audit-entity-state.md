---
"authhero": patch
---

Capture entity state on branding and prompt audit events. Branding updates, universal-login template writes and deletes, prompt-settings updates and custom-text writes and deletes now carry `before`/`after`/`diff` on the emitted audit event, like themes and users already did.
