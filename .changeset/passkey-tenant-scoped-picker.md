---
"authhero": patch
---

Scope passkey authentication to the current tenant when the user is known. The "Log in with passkey" link on the login screen is hidden when the session's user has no passkey registered under the current tenant, and `allowCredentials` is populated on the passkey challenge and conditional-mediation flows so the browser/OS picker only offers credentials belonging to this tenant. This prevents cross-tenant passkey confusion when multiple tenants share the same auth host (same WebAuthn `rpId`).
