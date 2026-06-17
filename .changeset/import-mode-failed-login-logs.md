---
"authhero": patch
---

Fix login log accuracy for import-mode (Auth0 lazy migration) connections:

- An unknown user now logs `fu` (Failed Login - Invalid Email/Username) instead
  of `fp` (Failed Login - Incorrect Password), matching Auth0's event taxonomy.
  The wrong-password-on-existing-user branch continues to log `fp`.
- Upstream password-realm grant and `/userinfo` failures during lazy migration
  were previously swallowed to a `console.warn` only. They now also emit a
  structured `FAILED_LOGIN` tenant log including the upstream error code and
  description, so import-mode failures are debuggable without `wrangler tail`.
