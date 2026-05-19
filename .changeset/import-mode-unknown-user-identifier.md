---
"authhero": patch
---

Fix login on `import_mode: true` connections when the user hasn't been migrated yet. The identifier screen now lets an unknown email through to the password challenge (so the upstream credentials can be verified) instead of failing with "User account does not exist", and `validateSignupEmail` no longer treats a missing local user on an import-mode connection as a blocked signup.
