---
"authhero": patch
---

Don't delegate to the upstream password source when the user has a current local password (#992)

The lazy-migration fallback for `import_mode` connections now only fires when the user has no current local password. Once a password exists locally, a mismatch is a real failed login — matching Auth0, which never re-consults the legacy source after import. Previously a migrated user who changed their password in authhero could still log in with the old upstream password, and every wrong-password typo triggered an upstream call.
